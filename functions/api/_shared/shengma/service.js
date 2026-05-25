import { first, run } from '../d1.js';
import { getSettingValue, saveSettingValue } from './settings.js';
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
const MAX_SALES_PAGES = 200;
const RUN_LOCK_TIMEOUT_MS = 5 * 60 * 1000;

const SCHEDULE_SETTING_KEY = 'shengmaSchedule';
const DEFAULT_SCHEDULE = {
  enabled: false,
  mode: 'daily',
  dailyTime: '09:00',
  intervalMinutes: 60,
  scope: ['inventory', 'sales'],
  windowDays: 1,
  timezoneOffsetMinutes: 480,
  lastTriggerAt: 0
};

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizeDailyTime(value) {
  const text = String(value || '').trim();
  const match = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (!match) return '09:00';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function normalizeSchedule(raw) {
  const base = { ...DEFAULT_SCHEDULE, ...(raw && typeof raw === 'object' ? raw : {}) };
  const mode = base.mode === 'interval' ? 'interval' : 'daily';
  return {
    enabled: !!base.enabled,
    mode,
    dailyTime: normalizeDailyTime(base.dailyTime),
    intervalMinutes: clampInt(base.intervalMinutes, 5, 1440, 60),
    scope: normalizeScope(base.scope),
    windowDays: clampInt(base.windowDays, 1, MAX_RANGE_DAYS, 1),
    timezoneOffsetMinutes: clampInt(base.timezoneOffsetMinutes, -720, 840, 480),
    lastTriggerAt: Number(base.lastTriggerAt) || 0
  };
}

function computeNextRunAt(schedule, now = Date.now()) {
  if (!schedule.enabled) return null;
  if (schedule.mode === 'interval') {
    const intervalMs = schedule.intervalMinutes * 60 * 1000;
    if (!schedule.lastTriggerAt) return now;
    return schedule.lastTriggerAt + intervalMs;
  }
  // daily mode: next occurrence of dailyTime in the configured timezone
  const offsetMs = schedule.timezoneOffsetMinutes * 60 * 1000;
  const [h, m] = schedule.dailyTime.split(':').map(Number);
  const localNow = new Date(now + offsetMs);
  const localY = localNow.getUTCFullYear();
  const localMo = localNow.getUTCMonth();
  const localD = localNow.getUTCDate();
  let nextLocal = Date.UTC(localY, localMo, localD, h, m, 0) - offsetMs;
  if (nextLocal <= now || (schedule.lastTriggerAt && schedule.lastTriggerAt >= nextLocal - 60000)) {
    nextLocal += 24 * 60 * 60 * 1000;
  }
  return nextLocal;
}

export async function getShengmaSchedule(db) {
  const raw = await getSettingValue(db, SCHEDULE_SETTING_KEY);
  return normalizeSchedule(raw);
}

export async function saveShengmaSchedule(db, payload) {
  const next = normalizeSchedule(payload);
  // preserve lastTriggerAt from existing record (do not let UI overwrite it)
  const existing = await getShengmaSchedule(db);
  next.lastTriggerAt = existing.lastTriggerAt;
  await saveSettingValue(db, SCHEDULE_SETTING_KEY, next);
  return next;
}

async function markScheduleTriggered(db, schedule, triggeredAt) {
  const next = { ...schedule, lastTriggerAt: triggeredAt };
  await saveSettingValue(db, SCHEDULE_SETTING_KEY, next);
  return next;
}

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

  const schedule = await getShengmaSchedule(env.DB);

  return {
    credentials: { configured: hasShengmaCredentials(env) },
    mapping: {
      localMachineName: SHENGMA_LOCAL_MACHINE_NAME,
      vendorDeviceCode: SHENGMA_VENDOR_DEVICE_CODE,
      vendorMachineId: SHENGMA_VENDOR_MACHINE_ID
    },
    lastRun: mapRun(lastRun),
    schedule: {
      enabled: schedule.enabled,
      mode: schedule.mode,
      dailyTime: schedule.dailyTime,
      intervalMinutes: schedule.intervalMinutes,
      scope: schedule.scope,
      windowDays: schedule.windowDays,
      timezoneOffsetMinutes: schedule.timezoneOffsetMinutes,
      lastTriggerAt: schedule.lastTriggerAt || null,
      nextRunAt: computeNextRunAt(schedule)
    }
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
  const triggerSource = payload.triggerSource || (payload.dryRun ? 'preview' : 'manual');
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
    triggerSource
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
    for (let page = 1; page <= MAX_SALES_PAGES; page += 1) {
      const html = await client.fetchSalesPage(payload.startDate, payload.endDate, page);
      const pageSales = parseSales(html);
      sales.push(...pageSales);
      const hasNextPage = hasNextSalesPage(html, page);
      if (page === MAX_SALES_PAGES && hasNextPage) {
        warnings.push(`销售历史超过 ${MAX_SALES_PAGES} 页，本次只同步前 ${MAX_SALES_PAGES} 页`);
      }
      if (!hasNextPage || pageSales.length === 0) break;
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

function localDateString(timestamp, offsetMinutes) {
  const local = new Date(timestamp + offsetMinutes * 60 * 1000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function runShengmaAutoSync(env, options = {}) {
  const force = !!options.force;
  const schedule = await getShengmaSchedule(env.DB);
  const now = Date.now();

  if (!schedule.enabled && !force) {
    return { skipped: true, reason: 'disabled', schedule, nextRunAt: null };
  }
  if (!hasShengmaCredentials(env)) {
    return { skipped: true, reason: 'no-credentials', schedule, nextRunAt: computeNextRunAt(schedule, now) };
  }

  const nextRunAt = computeNextRunAt(schedule, now);
  if (!force && nextRunAt && nextRunAt > now) {
    return { skipped: true, reason: 'not-due', schedule, nextRunAt };
  }

  const offsetMinutes = schedule.timezoneOffsetMinutes;
  const endDate = localDateString(now, offsetMinutes);
  const startDate = localDateString(now - (schedule.windowDays - 1) * 86400000, offsetMinutes);

  const triggeredAt = now;
  await markScheduleTriggered(env.DB, schedule, triggeredAt);

  const payload = {
    startDate,
    endDate,
    dryRun: false,
    scope: schedule.scope,
    triggerSource: force ? 'auto-force' : 'auto'
  };

  let runId;
  try {
    runId = await createRun(env.DB, payload);
  } catch (error) {
    return {
      skipped: true,
      reason: 'lock',
      message: error instanceof Error ? error.message : 'lock',
      schedule,
      nextRunAt: computeNextRunAt({ ...schedule, lastTriggerAt: triggeredAt }, now)
    };
  }

  try {
    const vendorData = await collectVendorData(env, payload);
    const result = await importShengmaData(env, runId, { ...payload, ...vendorData });
    const finished = await finishRun(env.DB, runId, 'success', result);
    return {
      skipped: false,
      run: finished,
      schedule: { ...schedule, lastTriggerAt: triggeredAt },
      nextRunAt: computeNextRunAt({ ...schedule, lastTriggerAt: triggeredAt }, now)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '盛码同步失败';
    const failed = await finishRun(env.DB, runId, 'failed', {
      summary: null,
      warnings: [],
      errorMessage: message
    });
    return {
      skipped: false,
      run: failed,
      schedule: { ...schedule, lastTriggerAt: triggeredAt },
      nextRunAt: computeNextRunAt({ ...schedule, lastTriggerAt: triggeredAt }, now),
      error: message
    };
  }
}
