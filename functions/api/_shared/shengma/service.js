import { first, run } from '../d1.js';
import {
  SHENGMA_INTEGRATION,
  SHENGMA_LOCAL_MACHINE_NAME,
  SHENGMA_VENDOR_DEVICE_CODE,
  SHENGMA_VENDOR_MACHINE_ID
} from './constants.js';
import { hasShengmaCredentials, ShengmaClient } from './client.js';
import { aggregateInventory } from './mapper.js';
import { hasNextSalesPage, parseCosts, parseGoods, parseSales } from './parser.js';
import { importShengmaData, summarizeDryRun } from './importer.js';

const MAX_RANGE_DAYS = 31;
const RUN_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

function toDateOnly(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function dateDiffDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86400000);
}

function normalizeScope(value) {
  const raw = Array.isArray(value) ? value : ['inventory', 'sales'];
  const scope = raw.filter(item => item === 'inventory' || item === 'sales');
  return scope.length ? Array.from(new Set(scope)) : ['inventory', 'sales'];
}

function parseJsonField(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    startedAt: Number(row.started_at) || 0,
    finishedAt: row.finished_at ? Number(row.finished_at) : null,
    status: row.status,
    dryRun: !!row.dry_run,
    dateRange: {
      start: row.date_start,
      end: row.date_end
    },
    summary: parseJsonField(row.summary_json, null),
    warnings: parseJsonField(row.warnings_json, []),
    errorMessage: row.error_message || ''
  };
}

export async function getShengmaStatus(env) {
  const lastRun = await first(env.DB, `
    SELECT *
    FROM external_sync_runs
    WHERE integration = ?
    ORDER BY started_at DESC
    LIMIT 1
  `, [SHENGMA_INTEGRATION]);

  return {
    credentials: { configured: hasShengmaCredentials(env) },
    mapping: {
      localMachineName: SHENGMA_LOCAL_MACHINE_NAME,
      vendorDeviceCode: SHENGMA_VENDOR_DEVICE_CODE,
      vendorMachineId: SHENGMA_VENDOR_MACHINE_ID
    },
    lastRun: mapRun(lastRun)
  };
}

export function validateSyncPayload(body) {
  const startDate = toDateOnly(body?.startDate);
  const endDate = toDateOnly(body?.endDate);
  if (!startDate || !endDate) throw new Error('请提供 YYYY-MM-DD 格式的开始和结束日期');
  const diff = dateDiffDays(startDate, endDate);
  if (diff < 0) throw new Error('结束日期不能早于开始日期');
  if (diff > MAX_RANGE_DAYS - 1) throw new Error('同步日期范围最多 31 天');
  return {
    startDate,
    endDate,
    dryRun: body?.dryRun !== false,
    scope: normalizeScope(body?.scope)
  };
}

async function releaseStaleLocks(db) {
  const cutoff = Date.now() - RUN_LOCK_TIMEOUT_MS;
  await run(db, `
    UPDATE external_sync_runs
    SET status = 'failed',
        finished_at = ?,
        error_message = '同步锁超过 5 分钟自动释放'
    WHERE integration = ?
      AND status = 'running'
      AND started_at < ?
  `, [Date.now(), SHENGMA_INTEGRATION, cutoff]);
}

async function createRun(db, payload) {
  await releaseStaleLocks(db);
  const running = await first(db, `
    SELECT id
    FROM external_sync_runs
    WHERE integration = ? AND status = 'running'
    LIMIT 1
  `, [SHENGMA_INTEGRATION]);
  if (running) throw new Error('已有盛码同步正在运行，请稍后再试');

  const startedAt = Date.now();
  const result = await db.prepare(`
    INSERT INTO external_sync_runs (
      integration, started_at, status, dry_run, date_start, date_end, trigger_source
    ) VALUES (?, ?, 'running', ?, ?, ?, ?)
  `).bind(
    SHENGMA_INTEGRATION,
    startedAt,
    payload.dryRun ? 1 : 0,
    payload.startDate,
    payload.endDate,
    payload.dryRun ? 'preview' : 'manual'
  ).run();
  return result.meta?.last_row_id || result.meta?.lastRowId || startedAt;
}

async function finishRun(db, runId, status, payload) {
  await run(db, `
    UPDATE external_sync_runs
    SET status = ?,
        finished_at = ?,
        summary_json = ?,
        warnings_json = ?,
        error_message = ?
    WHERE id = ?
  `, [
    status,
    Date.now(),
    JSON.stringify(payload.summary || null),
    JSON.stringify(payload.warnings || []),
    payload.errorMessage || null,
    runId
  ]);
  return mapRun(await first(db, 'SELECT * FROM external_sync_runs WHERE id = ? LIMIT 1', [runId]));
}

async function collectVendorData(env, payload) {
  const client = new ShengmaClient(env);
  const warnings = [];
  const goodsHtml = payload.scope.includes('inventory') ? await client.fetchGoods() : '';
  const costsHtml = payload.scope.includes('inventory') ? await client.fetchCosts() : '';
  const goods = payload.scope.includes('inventory') ? parseGoods(goodsHtml) : [];
  const costs = payload.scope.includes('inventory') ? parseCosts(costsHtml) : [];
  const inventoryItems = payload.scope.includes('inventory')
    ? aggregateInventory(goods, costs, warnings)
    : [];

  if (payload.scope.includes('inventory') && goods.length === 0) {
    throw new Error('未能从盛码 goods.html 解析出库存数据，页面结构可能已变化');
  }

  const sales = [];
  if (payload.scope.includes('sales')) {
    for (let page = 1; page <= 20; page += 1) {
      const html = await client.fetchSalesPage(payload.startDate, payload.endDate, page);
      const pageSales = parseSales(html);
      sales.push(...pageSales);
      if (!hasNextSalesPage(html, page) || pageSales.length === 0) break;
    }
  }

  return { inventoryItems, sales, warnings };
}

export async function runShengmaSync(env, body) {
  const payload = validateSyncPayload(body);
  const runId = await createRun(env.DB, payload);

  try {
    const vendorData = await collectVendorData(env, payload);
    const result = payload.dryRun
      ? {
          summary: summarizeDryRun(vendorData.inventoryItems, vendorData.sales, vendorData.warnings),
          warnings: vendorData.warnings
        }
      : await importShengmaData(env, runId, { ...payload, ...vendorData });

    return await finishRun(env.DB, runId, 'success', result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '盛码同步失败';
    const failedRun = await finishRun(env.DB, runId, 'failed', {
      summary: null,
      warnings: [],
      errorMessage: message
    });
    throw Object.assign(new Error(message), { run: failedRun });
  }
}
