import { all, first, placeholders, run } from './d1.js';
import {
  centsToMoney,
  moneyToCents,
  newId,
  nowIso,
  positiveQuantity,
  recordDate,
  stringOrNull,
  yearMonthFromDate
} from './validators.js';

const MAX_TREND_DAYS = 90;
const DEFAULT_TREND_DAYS = 30;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const D1_IN_CLAUSE_CHUNK_SIZE = 90;
const MACHINE_ALIASES = new Map([
  ['三号机', '轨道机']
]);

export class ProfitValidationError extends Error {}

export function normalizeMonth(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 7);
}

function normalizeRecordListMonth(value) {
  const text = String(value || '').trim();
  if (text === 'all' || text === '全部') return '';
  return normalizeMonth(text);
}

export function normalizeDays(value) {
  const days = Math.round(Number(value) || DEFAULT_TREND_DAYS);
  return Math.min(Math.max(days, 1), MAX_TREND_DAYS);
}

export function normalizeLimit(value) {
  const limit = Math.round(Number(value) || DEFAULT_LIMIT);
  return Math.min(Math.max(limit, 1), MAX_LIMIT);
}

export function normalizeMachineId(value) {
  const text = String(value || '').trim();
  if (!text || text === 'all') return '';
  return MACHINE_ALIASES.get(text) || text;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateSeries(days) {
  const end = new Date(`${todayDate()}T00:00:00.000Z`);
  const start = addDays(end, -(days - 1));
  return Array.from({ length: days }, (_, index) => formatDate(addDays(start, index)));
}

function dateWindowStart(days) {
  return dateSeries(days)[0];
}

function money(value) {
  return centsToMoney(Number(value) || 0);
}

function chunkValues(values, size = D1_IN_CLAUSE_CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function allByChunkedIds(db, ids, sqlFactory) {
  const rows = [];
  for (const chunk of chunkValues(ids)) {
    rows.push(...await all(db, sqlFactory(chunk.length), chunk));
  }
  return rows;
}

function profitRatePercent(netRevenueCents, grossProfitCents) {
  const netRevenue = Number(netRevenueCents) || 0;
  return netRevenue > 0 ? (Number(grossProfitCents) || 0) / netRevenue * 100 : 0;
}

function machineSql(column) {
  return `CASE WHEN ${column} = '三号机' THEN '轨道机' ELSE ${column} END`;
}

function machineFilterFor(column, machineId) {
  const normalized = normalizeMachineId(machineId);
  if (!normalized) return { sql: '', params: [] };
  if (normalized === '轨道机') {
    return { sql: `AND ${column} IN (?, ?)`, params: ['轨道机', '三号机'] };
  }
  return { sql: `AND ${column} = ?`, params: [normalized] };
}

function signedCogsSql(column = 'total_cogs_cents', typeColumn = 'type') {
  return `CASE WHEN ${typeColumn} = 'refund' THEN -${column} ELSE ${column} END`;
}

function normalizeStatus(value) {
  const text = String(value || '').trim();
  return ['active', 'voided', 'all'].includes(text) ? text : 'active';
}

function normalizeSalesType(value) {
  const text = String(value || '').trim();
  return ['sale', 'refund', 'loss', 'all'].includes(text) ? text : 'all';
}

function normalizeProductName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeProductStatus(value) {
  return value === 'archived' ? 'archived' : 'active';
}

function requireText(value, message) {
  const text = String(value || '').trim();
  if (!text) throw new ProfitValidationError(message);
  return text;
}

function toSummaryKpis(row, quantity, purchaseCost, missingCostProductCount, mergedProductCount) {
  const netRevenueCents = Number(row?.net_revenue_cents) || 0;
  const grossProfitCents = Number(row?.gross_profit_cents) || 0;
  return {
    grossSales: money(row?.gross_sales_cents),
    refunds: money(row?.refunds_cents),
    fees: money(row?.fees_cents),
    discounts: money(row?.discounts_cents),
    netRevenue: money(netRevenueCents),
    cogs: money(row?.cogs_cents),
    grossProfit: money(grossProfitCents),
    profitRate: profitRatePercent(netRevenueCents, grossProfitCents),
    purchaseCost: money(purchaseCost?.purchase_cost_cents),
    orderCount: Number(row?.order_count) || 0,
    quantity: Number(quantity?.quantity) || 0,
    missingCostProductCount: Number(missingCostProductCount?.count) || 0,
    mergedProductCount: Number(mergedProductCount?.count) || 0
  };
}

export async function getProfitSummary(env, options = {}) {
  const month = normalizeMonth(options.month);
  const days = normalizeDays(options.days);
  const machineId = normalizeMachineId(options.machineId);
  const [
    totals,
    quantity,
    purchaseCost,
    missingCostProductCount,
    mergedProductCount,
    dailyTrend,
    dailyTrendByMachine,
    machineRanking,
    productRanking,
    costGaps,
    productMerges
  ] = await Promise.all([
    getMonthlyTotals(env, month, machineId),
    getMonthlyQuantity(env, month, machineId),
    getPurchaseCost(env, month),
    getMissingCostProductCount(env, month, machineId),
    getMergedProductCount(env),
    getDailyTrend(env, days, machineId),
    getDailyTrendByMachine(env, days, machineId),
    getMachineRanking(env, month),
    getProductRanking(env, month, machineId),
    listCostGaps(env, { month, machineId, limit: 8 }),
    listProductMerges(env, { limit: 8 })
  ]);

  return {
    month,
    machineId: machineId || 'all',
    kpis: toSummaryKpis(totals, quantity, purchaseCost, missingCostProductCount, mergedProductCount),
    dailyTrend,
    dailyTrendByMachine,
    machineRanking,
    productRanking,
    costGaps,
    productMerges
  };
}

async function getMonthlyTotals(env, month, machineId) {
  const filter = machineFilterFor('machine_id', machineId);
  return await first(env.DB, `
    SELECT
      COUNT(*) AS order_count,
      COALESCE(SUM(gross_amount_cents), 0) AS gross_sales_cents,
      COALESCE(SUM(refund_amount_cents), 0) AS refunds_cents,
      COALESCE(SUM(platform_fee_cents + service_fee_cents), 0) AS fees_cents,
      COALESCE(SUM(discount_cents), 0) AS discounts_cents,
      COALESCE(SUM(net_revenue_cents), 0) AS net_revenue_cents,
      COALESCE(SUM(${signedCogsSql()}), 0) AS cogs_cents,
      COALESCE(SUM(gross_profit_cents), 0) AS gross_profit_cents
    FROM sales_records
    WHERE year_month = ?
      AND status = 'active'
      AND type IN ('sale', 'refund')
      ${filter.sql}
  `, [month, ...filter.params]);
}

async function getMonthlyQuantity(env, month, machineId) {
  const filter = machineFilterFor('sr.machine_id', machineId);
  return await first(env.DB, `
    SELECT COALESCE(SUM(sri.quantity), 0) AS quantity
    FROM sales_records sr
    JOIN sales_record_items sri ON sri.sales_record_id = sr.id
    WHERE sr.year_month = ?
      AND sr.status = 'active'
      AND sr.type = 'sale'
      ${filter.sql}
  `, [month, ...filter.params]);
}

async function getPurchaseCost(env, month) {
  return await first(env.DB, `
    SELECT COALESCE(SUM(pri.total_cost_cents), 0) AS purchase_cost_cents
    FROM purchase_records pr
    JOIN purchase_record_items pri ON pri.purchase_record_id = pr.id
    WHERE pr.status = 'active'
      AND substr(pr.record_date, 1, 7) = ?
  `, [month]);
}

async function getMissingCostProductCount(env, month, machineId) {
  const filter = machineFilterFor('sr.machine_id', machineId);
  return await first(env.DB, `
    WITH gap_products AS (
      SELECT sri.product_global_id
      FROM sales_records sr
      JOIN sales_record_items sri ON sri.sales_record_id = sr.id
      LEFT JOIN (
        SELECT product_global_id, COUNT(*) AS cost_snapshot_count
        FROM cost_snapshots
        WHERE unit_cost_cents > 0
          OR source_type = 'manual_cost'
        GROUP BY product_global_id
      ) cs ON cs.product_global_id = sri.product_global_id
      WHERE sr.year_month = ?
        AND sr.status = 'active'
        AND sr.type = 'sale'
        AND sri.unit_cost_cents = 0
        ${filter.sql}
      GROUP BY sri.product_global_id
      HAVING COALESCE(MAX(cs.cost_snapshot_count), 0) = 0
    )
    SELECT COUNT(*) AS count FROM gap_products
  `, [month, ...filter.params]);
}

async function getMergedProductCount(env) {
  return await first(env.DB, `
    SELECT COUNT(*) AS count
    FROM products_global
    WHERE legacy_product_count > 1
  `);
}

async function getDailyTrend(env, days, machineId) {
  const startDate = dateWindowStart(days);
  const filter = machineFilterFor('machine_id', machineId);
  const rows = await all(env.DB, `
    SELECT
      record_date AS date,
      COALESCE(SUM(gross_amount_cents), 0) AS gross_sales_cents,
      COALESCE(SUM(refund_amount_cents), 0) AS refunds_cents,
      COALESCE(SUM(net_revenue_cents), 0) AS net_revenue_cents,
      COALESCE(SUM(${signedCogsSql()}), 0) AS cogs_cents,
      COALESCE(SUM(gross_profit_cents), 0) AS gross_profit_cents,
      COUNT(*) AS order_count
    FROM sales_records
    WHERE status = 'active'
      AND type IN ('sale', 'refund')
      AND record_date >= ?
      ${filter.sql}
    GROUP BY record_date
    ORDER BY record_date
  `, [startDate, ...filter.params]);
  const rowMap = new Map(rows.map(row => [row.date, row]));

  return dateSeries(days).map(date => {
    const row = rowMap.get(date) || {};
    return {
      date,
      grossSales: money(row.gross_sales_cents),
      refunds: money(row.refunds_cents),
      netRevenue: money(row.net_revenue_cents),
      cogs: money(row.cogs_cents),
      grossProfit: money(row.gross_profit_cents),
      orderCount: Number(row.order_count) || 0
    };
  });
}

async function getDailyTrendByMachine(env, days, machineId) {
  const dates = dateSeries(days);
  const startDate = dates[0];
  const filter = machineFilterFor('machine_id', machineId);
  const displayMachineSql = machineSql('machine_id');
  const rows = await all(env.DB, `
    SELECT
      record_date AS date,
      ${displayMachineSql} AS machine_id,
      COALESCE(SUM(gross_amount_cents), 0) AS gross_sales_cents,
      COALESCE(SUM(refund_amount_cents), 0) AS refunds_cents,
      COALESCE(SUM(net_revenue_cents), 0) AS net_revenue_cents,
      COALESCE(SUM(${signedCogsSql()}), 0) AS cogs_cents,
      COALESCE(SUM(gross_profit_cents), 0) AS gross_profit_cents,
      COUNT(*) AS order_count
    FROM sales_records
    WHERE status = 'active'
      AND type IN ('sale', 'refund')
      AND record_date >= ?
      ${filter.sql}
    GROUP BY record_date, ${displayMachineSql}
    ORDER BY ${displayMachineSql}, record_date
  `, [startDate, ...filter.params]);

  const machines = Array.from(new Set(rows.map(row => row.machine_id))).filter(Boolean);
  return machines.map(machine => {
    const rowMap = new Map(
      rows
        .filter(row => row.machine_id === machine)
        .map(row => [row.date, row])
    );
    return {
      machineId: machine,
      points: dates.map(date => {
        const row = rowMap.get(date) || {};
        return {
          date,
          grossSales: money(row.gross_sales_cents),
          refunds: money(row.refunds_cents),
          netRevenue: money(row.net_revenue_cents),
          cogs: money(row.cogs_cents),
          grossProfit: money(row.gross_profit_cents),
          orderCount: Number(row.order_count) || 0
        };
      })
    };
  });
}

async function getMachineRanking(env, month) {
  const displayMachineSql = machineSql('machine_id');
  const rows = await all(env.DB, `
    WITH totals_by_machine AS (
      SELECT
        ${displayMachineSql} AS machine_id,
        COALESCE(SUM(net_revenue_cents), 0) AS net_revenue_cents,
        COALESCE(SUM(${signedCogsSql()}), 0) AS cogs_cents,
        COALESCE(SUM(gross_profit_cents), 0) AS gross_profit_cents,
        COUNT(*) AS order_count
      FROM sales_records
      WHERE status = 'active'
        AND type IN ('sale', 'refund')
        AND year_month = ?
      GROUP BY ${displayMachineSql}
    ),
    quantity_by_machine AS (
      SELECT
        ${machineSql('sr.machine_id')} AS machine_id,
        COALESCE(SUM(sri.quantity), 0) AS quantity
      FROM sales_records sr
      JOIN sales_record_items sri ON sri.sales_record_id = sr.id
      WHERE sr.status = 'active'
        AND sr.type = 'sale'
        AND sr.year_month = ?
      GROUP BY ${machineSql('sr.machine_id')}
    )
    SELECT
      t.machine_id,
      t.net_revenue_cents,
      t.cogs_cents,
      t.gross_profit_cents,
      t.order_count,
      COALESCE(q.quantity, 0) AS quantity
    FROM totals_by_machine t
    LEFT JOIN quantity_by_machine q ON q.machine_id = t.machine_id
    ORDER BY t.net_revenue_cents DESC
    LIMIT 20
  `, [month, month]);

  return rows.map(row => ({
    machineId: row.machine_id,
    netRevenue: money(row.net_revenue_cents),
    cogs: money(row.cogs_cents),
    grossProfit: money(row.gross_profit_cents),
    profitRate: profitRatePercent(row.net_revenue_cents, row.gross_profit_cents),
    orderCount: Number(row.order_count) || 0,
    quantity: Number(row.quantity) || 0
  }));
}

async function getProductRanking(env, month, machineId) {
  const filter = machineFilterFor('sr.machine_id', machineId);
  const rows = await all(env.DB, `
    SELECT
      pg.id AS productGlobalId,
      pg.canonical_name AS productName,
      COALESCE(SUM(CASE WHEN sr.type = 'sale' THEN sri.quantity ELSE 0 END), 0) AS quantity,
      COALESCE(SUM(CASE WHEN sr.type = 'sale' THEN sri.line_amount_cents ELSE -sri.line_amount_cents END), 0) AS sales_amount_cents,
      COALESCE(SUM(CASE WHEN sr.type = 'sale' THEN sri.line_cogs_cents ELSE -sri.line_cogs_cents END), 0) AS cogs_cents
    FROM sales_records sr
    JOIN sales_record_items sri ON sri.sales_record_id = sr.id
    JOIN products_global pg ON pg.id = sri.product_global_id
    WHERE sr.year_month = ?
      AND sr.status = 'active'
      AND sr.type IN ('sale', 'refund')
      ${filter.sql}
    GROUP BY pg.id, pg.canonical_name
    ORDER BY sales_amount_cents DESC
    LIMIT 20
  `, [month, ...filter.params]);

  return rows.map(row => {
    const grossProfitCents = (Number(row.sales_amount_cents) || 0) - (Number(row.cogs_cents) || 0);
    return {
      productGlobalId: row.productGlobalId,
      productName: row.productName,
      quantity: Number(row.quantity) || 0,
      salesAmount: money(row.sales_amount_cents),
      cogs: money(row.cogs_cents),
      grossProfit: money(grossProfitCents),
      profitRate: profitRatePercent(row.sales_amount_cents, grossProfitCents)
    };
  });
}

export async function listCostGaps(env, options = {}) {
  const month = normalizeMonth(options.month);
  const machineId = normalizeMachineId(options.machineId);
  const limit = normalizeLimit(options.limit);
  const filter = machineFilterFor('sr.machine_id', machineId);
  const rows = await all(env.DB, `
    SELECT
      pg.id AS product_global_id,
      pg.canonical_name,
      SUM(sri.quantity) AS quantity,
      SUM(sri.line_amount_cents) AS sales_amount_cents,
      SUM(sri.line_cogs_cents) AS cogs_cents,
      COALESCE(MAX(cs.cost_snapshot_count), 0) AS cost_snapshot_count
    FROM sales_records sr
    JOIN sales_record_items sri ON sri.sales_record_id = sr.id
    JOIN products_global pg ON pg.id = sri.product_global_id
    LEFT JOIN (
      SELECT product_global_id, COUNT(*) AS cost_snapshot_count
      FROM cost_snapshots
      WHERE unit_cost_cents > 0
        OR source_type = 'manual_cost'
      GROUP BY product_global_id
    ) cs ON cs.product_global_id = pg.id
    WHERE sr.year_month = ?
      AND sr.status = 'active'
      AND sr.type = 'sale'
      AND sri.unit_cost_cents = 0
      ${filter.sql}
    GROUP BY pg.id, pg.canonical_name
    HAVING COALESCE(MAX(cs.cost_snapshot_count), 0) = 0
    ORDER BY sales_amount_cents DESC
    LIMIT ?
  `, [month, ...filter.params, limit]);

  return rows.map(row => ({
    productGlobalId: row.product_global_id,
    productName: row.canonical_name,
    quantity: Number(row.quantity) || 0,
    salesAmount: money(row.sales_amount_cents),
    cogs: money(row.cogs_cents),
    costSnapshotCount: Number(row.cost_snapshot_count) || 0
  }));
}

export async function listProductMerges(env, options = {}) {
  const limit = normalizeLimit(options.limit);
  const rows = await all(env.DB, `
    SELECT
      pg.id,
      pg.canonical_name,
      pg.normalized_name,
      pg.legacy_product_count,
      pg.source_product_ids_json,
      (
        SELECT group_concat(pa.alias_name, ' / ')
        FROM product_aliases pa
        WHERE pa.product_global_id = pg.id
      ) AS aliases
    FROM products_global pg
    WHERE pg.legacy_product_count > 1
    ORDER BY pg.legacy_product_count DESC, pg.canonical_name
    LIMIT ?
  `, [limit]);

  return rows.map(row => ({
    productGlobalId: row.id,
    productName: row.canonical_name,
    normalizedName: row.normalized_name,
    legacyProductCount: Number(row.legacy_product_count) || 0,
    sourceProductIds: safeJson(row.source_product_ids_json, []),
    aliases: String(row.aliases || '').split(' / ').filter(Boolean)
  }));
}

export async function listProfitProducts(env, options = {}) {
  const limit = normalizeLimit(options.limit);
  const includeArchived = options.includeArchived === true || options.includeArchived === 'true';
  const search = String(options.search || '').trim();
  const id = stringOrNull(options.id);
  const params = [];
  const filters = [];
  if (!includeArchived) filters.push("pg.status = 'active'");
  if (id) {
    filters.push('pg.id = ?');
    params.push(id);
  }
  if (search) {
    filters.push(`(
      pg.canonical_name LIKE ?
      OR pg.normalized_name LIKE ?
      OR EXISTS (
        SELECT 1
        FROM product_aliases search_pa
        WHERE search_pa.product_global_id = pg.id
          AND (
            search_pa.alias_name LIKE ?
            OR search_pa.normalized_alias LIKE ?
            OR search_pa.source_product_id LIKE ?
            OR search_pa.source_external_id LIKE ?
          )
      )
    )`);
    const keyword = `%${search}%`;
    const normalizedKeyword = `%${search.toLowerCase()}%`;
    params.push(keyword, normalizedKeyword, keyword, normalizedKeyword, keyword, keyword);
  }
  params.push(limit);

  const rows = await all(env.DB, `
    WITH alias_counts AS (
      SELECT product_global_id, COUNT(*) AS alias_count
      FROM product_aliases
      GROUP BY product_global_id
    ),
    purchase_agg AS (
      SELECT
        product_global_id,
        SUM(quantity) AS purchase_qty,
        SUM(total_cost_cents) AS purchase_cost_cents
      FROM purchase_record_items pri
      JOIN purchase_records pr ON pr.id = pri.purchase_record_id
      WHERE pr.status = 'active'
      GROUP BY product_global_id
    ),
    sales_agg AS (
      SELECT
        sri.product_global_id,
        SUM(CASE WHEN sr.type = 'sale' THEN sri.quantity ELSE 0 END) AS sale_qty,
        SUM(CASE WHEN sr.type = 'sale' THEN sri.line_amount_cents ELSE -sri.line_amount_cents END) AS sales_amount_cents,
        SUM(CASE WHEN sr.type = 'sale' THEN sri.line_cogs_cents ELSE -sri.line_cogs_cents END) AS cogs_cents
      FROM sales_record_items sri
      JOIN sales_records sr ON sr.id = sri.sales_record_id
      WHERE sr.status = 'active'
        AND sr.type IN ('sale', 'refund')
      GROUP BY sri.product_global_id
    ),
    last_cost AS (
      SELECT product_global_id, unit_cost_cents, effective_at
      FROM (
        SELECT
          product_global_id,
          unit_cost_cents,
          effective_at,
          ROW_NUMBER() OVER (
            PARTITION BY product_global_id
            ORDER BY effective_at DESC, created_at DESC
          ) AS rn
        FROM cost_snapshots
        WHERE unit_cost_cents > 0
      )
      WHERE rn = 1
    )
    SELECT
      pg.id,
      pg.canonical_name,
      pg.normalized_name,
      pg.category,
      pg.default_sell_price_cents,
      pg.status,
      pg.legacy_product_count,
      COALESCE(ac.alias_count, 0) AS alias_count,
      COALESCE(pa.purchase_qty, 0) AS purchase_qty,
      COALESCE(pa.purchase_cost_cents, 0) AS purchase_cost_cents,
      COALESCE(sa.sale_qty, 0) AS sale_qty,
      COALESCE(sa.sales_amount_cents, 0) AS sales_amount_cents,
      COALESCE(sa.cogs_cents, 0) AS cogs_cents,
      COALESCE(lc.unit_cost_cents, 0) AS last_cost_cents,
      lc.effective_at AS last_cost_at
    FROM products_global pg
    LEFT JOIN alias_counts ac ON ac.product_global_id = pg.id
    LEFT JOIN purchase_agg pa ON pa.product_global_id = pg.id
    LEFT JOIN sales_agg sa ON sa.product_global_id = pg.id
    LEFT JOIN last_cost lc ON lc.product_global_id = pg.id
    ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
    ORDER BY pg.status, pg.canonical_name
    LIMIT ?
  `, params);

  const aliasMap = await productAliasMap(env, rows.map(row => row.id));
  return rows.map(row => {
    const grossProfitCents = (Number(row.sales_amount_cents) || 0) - (Number(row.cogs_cents) || 0);
    return {
      productGlobalId: row.id,
      productName: row.canonical_name,
      normalizedName: row.normalized_name,
      category: row.category || '其他',
      defaultSellPrice: money(row.default_sell_price_cents),
      status: row.status,
      legacyProductCount: Number(row.legacy_product_count) || 0,
      aliasCount: Number(row.alias_count) || 0,
      purchaseQuantity: Number(row.purchase_qty) || 0,
      purchaseCost: money(row.purchase_cost_cents),
      saleQuantity: Number(row.sale_qty) || 0,
      salesAmount: money(row.sales_amount_cents),
      cogs: money(row.cogs_cents),
      grossProfit: money(grossProfitCents),
      lastCost: money(row.last_cost_cents),
      lastCostAt: row.last_cost_at || null,
      aliases: aliasMap.get(row.id) || []
    };
  });
}

export async function saveProfitProduct(env, payload = {}) {
  const timestamp = nowIso();
  const id = stringOrNull(payload.id || payload.productGlobalId) || `pg:manual:${newId()}`;
  const productName = requireText(payload.productName || payload.canonicalName || payload.name, '请填写商品名称');
  const normalizedName = normalizeProductName(payload.normalizedName || productName);
  if (!normalizedName) throw new ProfitValidationError('商品名称无效');

  const existing = await first(env.DB, 'SELECT id FROM products_global WHERE normalized_name = ? AND id != ? LIMIT 1', [normalizedName, id]);
  if (existing) throw new ProfitValidationError('已有同名全局商品');

  const row = await first(env.DB, 'SELECT id FROM products_global WHERE id = ? LIMIT 1', [id]);
  if (row) {
    await run(env.DB, `
      UPDATE products_global
      SET canonical_name = ?,
          normalized_name = ?,
          category = ?,
          default_sell_price_cents = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
    `, [
      productName,
      normalizedName,
      stringOrNull(payload.category) || '其他',
      moneyToCents(payload.defaultSellPrice),
      normalizeProductStatus(payload.status),
      timestamp,
      id
    ]);
  } else {
    await run(env.DB, `
      INSERT INTO products_global (
        id, canonical_name, normalized_name, category, default_sell_price_cents,
        status, legacy_product_count, source_product_ids_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, '[]', ?, ?)
    `, [
      id,
      productName,
      normalizedName,
      stringOrNull(payload.category) || '其他',
      moneyToCents(payload.defaultSellPrice),
      normalizeProductStatus(payload.status),
      timestamp,
      timestamp
    ]);
  }

  await run(env.DB, `
    INSERT INTO product_aliases (
      id, product_global_id, alias_name, normalized_alias, source, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 'manual', 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      product_global_id = excluded.product_global_id,
      alias_name = excluded.alias_name,
      normalized_alias = excluded.normalized_alias,
      status = excluded.status,
      updated_at = excluded.updated_at
  `, [`pa:manual:${id}`, id, productName, normalizedName, timestamp, timestamp]);

  return await getProfitProduct(env, id);
}

export async function archiveProfitProduct(env, id, status = 'archived') {
  const productId = requireText(id, '缺少商品 ID');
  await run(env.DB, `
    UPDATE products_global
    SET status = ?, updated_at = ?
    WHERE id = ?
  `, [normalizeProductStatus(status), nowIso(), productId]);
  return await getProfitProduct(env, productId);
}

export async function saveProfitPurchase(env, payload = {}) {
  const timestamp = nowIso();
  const date = recordDate(payload.recordDate);
  const items = normalizePurchaseItems(payload.items);
  const id = stringOrNull(payload.id) || `pr:manual:${newId()}`;
  const existing = await first(env.DB, 'SELECT * FROM purchase_records WHERE id = ? LIMIT 1', [id]);
  if (existing?.legacy_purchase_id) throw new ProfitValidationError('历史进货单已归档，不支持编辑');
  if (existing?.status === 'voided') throw new ProfitValidationError('已作废进货单不能编辑');

  for (const item of items) await ensureProductExists(env, item.productGlobalId);

  if (existing) {
    await run(env.DB, `
      UPDATE purchase_records
      SET record_date = ?, source = ?, note = ?, updated_at = ?
      WHERE id = ?
    `, [date, stringOrNull(payload.source) || 'manual', stringOrNull(payload.note), timestamp, id]);
    await replacePurchaseItems(env, id, items, date, timestamp);
  } else {
    await run(env.DB, `
      INSERT INTO purchase_records (
        id, record_date, source, note, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `, [id, date, stringOrNull(payload.source) || 'manual', stringOrNull(payload.note), timestamp, timestamp]);
    await replacePurchaseItems(env, id, items, date, timestamp);
  }

  return await getProfitPurchase(env, id);
}

export async function voidProfitPurchase(env, id) {
  const recordId = requireText(id, '缺少进货单 ID');
  const existing = await first(env.DB, 'SELECT * FROM purchase_records WHERE id = ? LIMIT 1', [recordId]);
  if (!existing) throw new ProfitValidationError('进货单不存在');
  if (existing.legacy_purchase_id) throw new ProfitValidationError('历史进货单已归档，不支持作废');
  const timestamp = nowIso();
  await run(env.DB, `
    UPDATE purchase_records
    SET status = 'voided', voided_at = ?, updated_at = ?
    WHERE id = ?
  `, [timestamp, timestamp, recordId]);
  await run(env.DB, "DELETE FROM cost_snapshots WHERE source_type = 'purchase_item' AND source_record_id = ?", [recordId]);
  return await getProfitPurchase(env, recordId);
}

export async function saveProfitSale(env, payload = {}) {
  const timestamp = nowIso();
  const date = recordDate(payload.recordDate);
  const type = normalizeSalesType(payload.type);
  if (type === 'all') throw new ProfitValidationError('销售类型无效');
  const machineId = normalizeMachineId(payload.machineId) || requireText(payload.machineId, '请选择设备');
  const items = await normalizeSalesItems(env, payload.items, date);
  const id = stringOrNull(payload.id) || `sr:manual:${newId()}`;
  const existing = await first(env.DB, 'SELECT * FROM sales_records WHERE id = ? LIMIT 1', [id]);
  if (existing?.legacy_sales_id) throw new ProfitValidationError('历史销售单已归档，不支持编辑');
  if (existing?.status === 'voided') throw new ProfitValidationError('已作废销售单不能编辑');

  for (const item of items) await ensureProductExists(env, item.productGlobalId);

  const totals = salesTotals(type, items, payload);
  if (existing) {
    await run(env.DB, `
      UPDATE sales_records
      SET type = ?,
          machine_id = ?,
          record_date = ?,
          year_month = ?,
          source = ?,
          external_id = ?,
          gross_amount_cents = ?,
          refund_amount_cents = ?,
          platform_fee_cents = ?,
          service_fee_cents = ?,
          discount_cents = ?,
          net_revenue_cents = ?,
          total_cogs_cents = ?,
          gross_profit_cents = ?,
          note = ?,
          updated_at = ?
      WHERE id = ?
    `, [
      type,
      machineId,
      date,
      yearMonthFromDate(date),
      stringOrNull(payload.source) || 'manual',
      stringOrNull(payload.externalId),
      totals.grossAmountCents,
      totals.refundAmountCents,
      totals.platformFeeCents,
      totals.serviceFeeCents,
      totals.discountCents,
      totals.netRevenueCents,
      totals.totalCogsCents,
      totals.grossProfitCents,
      stringOrNull(payload.note),
      timestamp,
      id
    ]);
    await replaceSalesItems(env, id, items, date, timestamp);
  } else {
    await run(env.DB, `
      INSERT INTO sales_records (
        id, type, machine_id, record_date, year_month, source, external_id,
        gross_amount_cents, refund_amount_cents, platform_fee_cents, service_fee_cents,
        discount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents,
        note, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `, [
      id,
      type,
      machineId,
      date,
      yearMonthFromDate(date),
      stringOrNull(payload.source) || 'manual',
      stringOrNull(payload.externalId),
      totals.grossAmountCents,
      totals.refundAmountCents,
      totals.platformFeeCents,
      totals.serviceFeeCents,
      totals.discountCents,
      totals.netRevenueCents,
      totals.totalCogsCents,
      totals.grossProfitCents,
      stringOrNull(payload.note),
      timestamp,
      timestamp
    ]);
    await replaceSalesItems(env, id, items, date, timestamp);
  }

  return await getProfitSale(env, id);
}

export async function voidProfitSale(env, id) {
  const recordId = requireText(id, '缺少销售单 ID');
  const existing = await first(env.DB, 'SELECT * FROM sales_records WHERE id = ? LIMIT 1', [recordId]);
  if (!existing) throw new ProfitValidationError('销售单不存在');
  if (existing.legacy_sales_id) throw new ProfitValidationError('历史销售单已归档，不支持作废');
  const timestamp = nowIso();
  await run(env.DB, `
    UPDATE sales_records
    SET status = 'voided', voided_at = ?, updated_at = ?
    WHERE id = ?
  `, [timestamp, timestamp, recordId]);
  await run(env.DB, "DELETE FROM cost_snapshots WHERE source_type = 'sale_item' AND source_record_id = ?", [recordId]);
  return await getProfitSale(env, recordId);
}

export async function listProfitPurchases(env, options = {}) {
  const month = normalizeRecordListMonth(options.month);
  const status = normalizeStatus(options.status);
  const limit = normalizeLimit(options.limit);
  const search = String(options.search || '').trim();
  const productGlobalId = String(options.productGlobalId || '').trim();
  const filters = [];
  const params = [];

  if (month) {
    filters.push('substr(pr.record_date, 1, 7) = ?');
    params.push(month);
  }
  if (status !== 'all') {
    filters.push('pr.status = ?');
    params.push(status);
  }
  if (productGlobalId) {
    filters.push(`EXISTS (
      SELECT 1
      FROM purchase_record_items product_pri
      WHERE product_pri.purchase_record_id = pr.id
        AND product_pri.product_global_id = ?
    )`);
    params.push(productGlobalId);
  }
  if (search) {
    filters.push(`(
      pr.id LIKE ?
      OR pr.legacy_purchase_id LIKE ?
      OR pr.source LIKE ?
      OR pr.note LIKE ?
      OR EXISTS (
        SELECT 1
        FROM purchase_record_items search_pri
        JOIN products_global search_pg ON search_pg.id = search_pri.product_global_id
        WHERE search_pri.purchase_record_id = pr.id
          AND search_pg.canonical_name LIKE ?
      )
    )`);
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword, keyword);
  }
  params.push(limit);

  const rows = await all(env.DB, `
    SELECT
      pr.id,
      pr.legacy_purchase_id,
      pr.record_date,
      pr.source,
      pr.status,
      pr.voided_at,
      pr.note,
      COALESCE(SUM(pri.quantity), 0) AS quantity,
      COALESCE(SUM(pri.total_cost_cents), 0) AS total_cost_cents,
      COUNT(pri.id) AS item_count
    FROM purchase_records pr
    LEFT JOIN purchase_record_items pri ON pri.purchase_record_id = pr.id
    WHERE ${filters.length ? filters.join(' AND ') : '1 = 1'}
    GROUP BY
      pr.id,
      pr.legacy_purchase_id,
      pr.record_date,
      pr.source,
      pr.status,
      pr.voided_at,
      pr.note,
      pr.created_at
    ORDER BY pr.record_date DESC, pr.created_at DESC, pr.id DESC
    LIMIT ?
  `, params);

  const itemMap = await purchaseItemMap(env, rows.map(row => row.id));
  return rows.map(row => ({
    id: row.id,
    legacyPurchaseId: row.legacy_purchase_id || null,
    recordDate: row.record_date,
    source: row.source || 'manual',
    status: row.status,
    voidedAt: row.voided_at || null,
    note: row.note || '',
    quantity: Number(row.quantity) || 0,
    totalCost: money(row.total_cost_cents),
    itemCount: Number(row.item_count) || 0,
    items: itemMap.get(row.id) || []
  }));
}

export async function listProfitSales(env, options = {}) {
  const month = normalizeRecordListMonth(options.month);
  const type = normalizeSalesType(options.type);
  const status = normalizeStatus(options.status);
  const machineId = normalizeMachineId(options.machineId);
  const limit = normalizeLimit(options.limit);
  const search = String(options.search || '').trim();
  const productGlobalId = String(options.productGlobalId || '').trim();
  const machineFilter = machineFilterFor('sr.machine_id', machineId);
  const filters = [];
  const params = [];

  if (month) {
    filters.push('sr.year_month = ?');
    params.push(month);
  }
  if (type !== 'all') {
    filters.push('sr.type = ?');
    params.push(type);
  }
  if (status !== 'all') {
    filters.push('sr.status = ?');
    params.push(status);
  }
  if (machineFilter.sql) {
    filters.push(machineFilter.sql.replace(/^AND\s+/i, ''));
    params.push(...machineFilter.params);
  }
  if (productGlobalId) {
    filters.push(`EXISTS (
      SELECT 1
      FROM sales_record_items product_sri
      WHERE product_sri.sales_record_id = sr.id
        AND product_sri.product_global_id = ?
    )`);
    params.push(productGlobalId);
  }
  if (search) {
    filters.push(`(
      sr.id LIKE ?
      OR sr.legacy_sales_id LIKE ?
      OR sr.external_id LIKE ?
      OR sr.source LIKE ?
      OR sr.note LIKE ?
      OR EXISTS (
        SELECT 1
        FROM sales_record_items search_sri
        JOIN products_global search_pg ON search_pg.id = search_sri.product_global_id
        WHERE search_sri.sales_record_id = sr.id
          AND search_pg.canonical_name LIKE ?
      )
    )`);
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword, keyword, keyword);
  }

  const rows = await all(env.DB, `
    WITH filtered_sales AS (
      SELECT
        sr.id,
        sr.legacy_sales_id,
        sr.type,
        sr.machine_id,
        sr.record_date,
        sr.year_month,
        sr.source,
        sr.external_id,
        sr.status,
        sr.voided_at,
        sr.note,
        sr.gross_amount_cents,
        sr.refund_amount_cents,
        sr.platform_fee_cents,
        sr.service_fee_cents,
        sr.discount_cents,
        sr.net_revenue_cents,
        sr.total_cogs_cents,
        sr.gross_profit_cents,
        sr.created_at
      FROM sales_records sr
      WHERE ${filters.length ? filters.join(' AND ') : '1 = 1'}
      ORDER BY sr.record_date DESC, sr.created_at DESC, sr.id DESC
      LIMIT ${limit}
    )
    SELECT
      sr.id,
      sr.legacy_sales_id,
      sr.type,
      ${machineSql('sr.machine_id')} AS machine_id,
      sr.record_date,
      sr.year_month,
      sr.source,
      sr.external_id,
      sr.status,
      sr.voided_at,
      sr.note,
      sr.gross_amount_cents,
      sr.refund_amount_cents,
      sr.platform_fee_cents,
      sr.service_fee_cents,
      sr.discount_cents,
      sr.net_revenue_cents,
      sr.total_cogs_cents,
      ${signedCogsSql('sr.total_cogs_cents', 'sr.type')} AS signed_cogs_cents,
      sr.gross_profit_cents,
      COALESCE(SUM(sri.quantity), 0) AS quantity,
      COUNT(sri.id) AS item_count
    FROM filtered_sales sr
    LEFT JOIN sales_record_items sri ON sri.sales_record_id = sr.id
    GROUP BY
      sr.id,
      sr.legacy_sales_id,
      sr.type,
      sr.machine_id,
      sr.record_date,
      sr.year_month,
      sr.source,
      sr.external_id,
      sr.status,
      sr.voided_at,
      sr.note,
      sr.gross_amount_cents,
      sr.refund_amount_cents,
      sr.platform_fee_cents,
      sr.service_fee_cents,
      sr.discount_cents,
      sr.net_revenue_cents,
      sr.total_cogs_cents,
      sr.gross_profit_cents,
      sr.created_at
    ORDER BY sr.record_date DESC, sr.created_at DESC, sr.id DESC
  `, params);

  const itemMap = await salesItemMap(env, rows.map(row => row.id));
  return rows.map(row => ({
    id: row.id,
    legacySalesId: row.legacy_sales_id || null,
    type: row.type,
    machineId: row.machine_id,
    recordDate: row.record_date,
    yearMonth: row.year_month,
    source: row.source || 'manual',
    externalId: row.external_id || null,
    status: row.status,
    voidedAt: row.voided_at || null,
    note: row.note || '',
    grossAmount: money(row.gross_amount_cents),
    refundAmount: money(row.refund_amount_cents),
    platformFee: money(row.platform_fee_cents),
    serviceFee: money(row.service_fee_cents),
    fees: money((Number(row.platform_fee_cents) || 0) + (Number(row.service_fee_cents) || 0)),
    discount: money(row.discount_cents),
    netRevenue: money(row.net_revenue_cents),
    totalCogs: money(row.total_cogs_cents),
    signedCogs: money(row.signed_cogs_cents),
    grossProfit: money(row.gross_profit_cents),
    quantity: Number(row.quantity) || 0,
    itemCount: Number(row.item_count) || 0,
    items: itemMap.get(row.id) || []
  }));
}

async function purchaseItemMap(env, recordIds) {
  if (recordIds.length === 0) return new Map();
  const rows = await allByChunkedIds(env.DB, recordIds, count => `
    SELECT
      pri.id,
      pri.purchase_record_id,
      pri.product_global_id,
      pg.canonical_name,
      pri.quantity,
      pri.unit_cost_cents,
      pri.total_cost_cents
    FROM purchase_record_items pri
    JOIN products_global pg ON pg.id = pri.product_global_id
    WHERE pri.purchase_record_id IN (${placeholders(count)})
    ORDER BY pg.canonical_name, pri.id
  `);
  const itemMap = new Map();
  for (const row of rows) {
    const item = {
      id: row.id,
      productGlobalId: row.product_global_id,
      productName: row.canonical_name,
      quantity: Number(row.quantity) || 0,
      unitCost: money(row.unit_cost_cents),
      totalCost: money(row.total_cost_cents)
    };
    const items = itemMap.get(row.purchase_record_id) || [];
    items.push(item);
    itemMap.set(row.purchase_record_id, items);
  }
  return itemMap;
}

async function salesItemMap(env, recordIds) {
  if (recordIds.length === 0) return new Map();
  const rows = await allByChunkedIds(env.DB, recordIds, count => `
    SELECT
      sri.id,
      sri.sales_record_id,
      sri.product_global_id,
      pg.canonical_name,
      sri.quantity,
      sri.unit_price_cents,
      sri.line_amount_cents,
      sri.unit_cost_cents,
      sri.line_cogs_cents,
      cs.id AS cost_snapshot_id,
      cs.source_type AS cost_snapshot_source_type,
      cs.effective_at AS cost_snapshot_effective_at,
      cs.created_at AS cost_snapshot_created_at
    FROM sales_record_items sri
    JOIN products_global pg ON pg.id = sri.product_global_id
    LEFT JOIN cost_snapshots cs ON cs.source_type = 'sale_item' AND cs.source_item_id = sri.id
    WHERE sri.sales_record_id IN (${placeholders(count)})
    ORDER BY pg.canonical_name, sri.id
  `);
  const itemMap = new Map();
  for (const row of rows) {
    const item = {
      id: row.id,
      productGlobalId: row.product_global_id,
      productName: row.canonical_name,
      quantity: Number(row.quantity) || 0,
      unitPrice: money(row.unit_price_cents),
      lineAmount: money(row.line_amount_cents),
      unitCost: money(row.unit_cost_cents),
      lineCogs: money(row.line_cogs_cents),
      costSnapshotId: row.cost_snapshot_id || null,
      costSnapshotSourceType: row.cost_snapshot_source_type || null,
      costSnapshotEffectiveAt: row.cost_snapshot_effective_at || null,
      costSnapshotCreatedAt: row.cost_snapshot_created_at || null
    };
    const items = itemMap.get(row.sales_record_id) || [];
    items.push(item);
    itemMap.set(row.sales_record_id, items);
  }
  return itemMap;
}

async function productAliasMap(env, productIds) {
  if (productIds.length === 0) return new Map();
  const rows = await allByChunkedIds(env.DB, productIds, count => `
    SELECT
      id,
      product_global_id,
      alias_name,
      normalized_alias,
      source,
      source_product_id,
      source_external_id,
      source_machine_id,
      status
    FROM product_aliases
    WHERE product_global_id IN (${placeholders(count)})
    ORDER BY source, alias_name, id
  `);
  const aliasMap = new Map();
  for (const row of rows) {
    const alias = {
      id: row.id,
      aliasName: row.alias_name,
      normalizedAlias: row.normalized_alias,
      source: row.source,
      sourceProductId: row.source_product_id || null,
      sourceExternalId: row.source_external_id || null,
      sourceMachineId: row.source_machine_id || null,
      status: row.status
    };
    const aliases = aliasMap.get(row.product_global_id) || [];
    aliases.push(alias);
    aliasMap.set(row.product_global_id, aliases);
  }
  return aliasMap;
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function getProfitProduct(env, id) {
  const rows = await listProfitProducts(env, { includeArchived: true, id, limit: 1 });
  return rows.find(row => row.productGlobalId === id) || null;
}

async function getProfitPurchase(env, id) {
  const row = await first(env.DB, 'SELECT record_date FROM purchase_records WHERE id = ? LIMIT 1', [id]);
  if (!row) return null;
  const rows = await listProfitPurchases(env, {
    month: String(row.record_date || '').slice(0, 7),
    status: 'all',
    search: id,
    limit: MAX_LIMIT
  });
  return rows.find(record => record.id === id) || null;
}

async function getProfitSale(env, id) {
  const row = await first(env.DB, 'SELECT year_month FROM sales_records WHERE id = ? LIMIT 1', [id]);
  if (!row) return null;
  const rows = await listProfitSales(env, {
    month: row.year_month,
    status: 'all',
    type: 'all',
    search: id,
    limit: MAX_LIMIT
  });
  return rows.find(record => record.id === id) || null;
}

async function ensureProductExists(env, id) {
  const productId = requireText(id, '请选择商品');
  const product = await first(env.DB, 'SELECT id FROM products_global WHERE id = ? LIMIT 1', [productId]);
  if (!product) throw new ProfitValidationError('商品不存在');
}

function normalizePurchaseItems(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (items.length === 0) throw new ProfitValidationError('请至少填写一条进货明细');
  return items.map(item => {
    const quantity = positiveQuantity(item.quantity);
    if (quantity <= 0) throw new ProfitValidationError('进货数量必须大于 0');
    const explicitTotal = moneyToCents(item.totalCost);
    const unitCost = moneyToCents(item.unitCost) || (explicitTotal > 0 ? Math.round(explicitTotal / quantity) : 0);
    const totalCost = explicitTotal || unitCost * quantity;
    if (unitCost <= 0 && totalCost <= 0) throw new ProfitValidationError('请填写进货成本');
    return {
      productGlobalId: requireText(item.productGlobalId, '请选择商品'),
      quantity,
      unitCostCents: unitCost,
      totalCostCents: totalCost
    };
  });
}

async function normalizeSalesItems(env, rawItems, date) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  if (items.length === 0) throw new ProfitValidationError('请至少填写一条销售明细');
  const normalized = [];
  for (const item of items) {
    const quantity = positiveQuantity(item.quantity);
    if (quantity <= 0) throw new ProfitValidationError('销售数量必须大于 0');
    const productGlobalId = requireText(item.productGlobalId, '请选择商品');
    const explicitLineAmount = moneyToCents(item.lineAmount);
    const unitPrice = moneyToCents(item.unitPrice) || (explicitLineAmount > 0 ? Math.round(explicitLineAmount / quantity) : 0);
    const lineAmount = explicitLineAmount || unitPrice * quantity;
    const latestCost = await latestCostCents(env, productGlobalId, date);
    const explicitLineCogs = moneyToCents(item.lineCogs);
    const unitCost = moneyToCents(item.unitCost) || (explicitLineCogs > 0 ? Math.round(explicitLineCogs / quantity) : latestCost);
    const lineCogs = explicitLineCogs || unitCost * quantity;
    normalized.push({
      productGlobalId,
      quantity,
      unitPriceCents: unitPrice,
      lineAmountCents: lineAmount,
      unitCostCents: unitCost,
      lineCogsCents: lineCogs
    });
  }
  return normalized;
}

function salesTotals(type, items, payload) {
  const lineAmountCents = items.reduce((sum, item) => sum + item.lineAmountCents, 0);
  const totalCogsCents = items.reduce((sum, item) => sum + item.lineCogsCents, 0);
  const platformFeeCents = moneyToCents(payload.platformFee);
  const serviceFeeCents = moneyToCents(payload.serviceFee);
  const discountCents = moneyToCents(payload.discount);
  const fees = platformFeeCents + serviceFeeCents;
  if (type === 'refund') {
    const refundAmountCents = moneyToCents(payload.refundAmount) || lineAmountCents;
    return {
      grossAmountCents: 0,
      refundAmountCents,
      platformFeeCents,
      serviceFeeCents,
      discountCents,
      netRevenueCents: -refundAmountCents - fees - discountCents,
      totalCogsCents,
      grossProfitCents: -refundAmountCents - fees - discountCents + totalCogsCents
    };
  }
  if (type === 'loss') {
    return {
      grossAmountCents: 0,
      refundAmountCents: 0,
      platformFeeCents: 0,
      serviceFeeCents: 0,
      discountCents: 0,
      netRevenueCents: 0,
      totalCogsCents,
      grossProfitCents: -totalCogsCents
    };
  }
  return {
    grossAmountCents: lineAmountCents,
    refundAmountCents: 0,
    platformFeeCents,
    serviceFeeCents,
    discountCents,
    netRevenueCents: lineAmountCents - fees - discountCents,
    totalCogsCents,
    grossProfitCents: lineAmountCents - fees - discountCents - totalCogsCents
  };
}

async function replacePurchaseItems(env, recordId, items, date, timestamp) {
  await run(env.DB, "DELETE FROM cost_snapshots WHERE source_type = 'purchase_item' AND source_record_id = ?", [recordId]);
  await run(env.DB, 'DELETE FROM purchase_record_items WHERE purchase_record_id = ?', [recordId]);
  for (const item of items) {
    const itemId = `pri:manual:${newId()}`;
    await run(env.DB, `
      INSERT INTO purchase_record_items (
        id, purchase_record_id, product_global_id, quantity, unit_cost_cents, total_cost_cents, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [itemId, recordId, item.productGlobalId, item.quantity, item.unitCostCents, item.totalCostCents, timestamp]);
    await run(env.DB, `
      INSERT INTO cost_snapshots (
        id, product_global_id, source_type, source_record_id, source_item_id,
        unit_cost_cents, quantity_context, total_cost_cents, effective_at, created_at
      )
      VALUES (?, ?, 'purchase_item', ?, ?, ?, ?, ?, ?, ?)
    `, [
      `cs:purchase:${itemId}`,
      item.productGlobalId,
      recordId,
      itemId,
      item.unitCostCents,
      item.quantity,
      item.totalCostCents,
      date,
      timestamp
    ]);
  }
}

async function replaceSalesItems(env, recordId, items, date, timestamp) {
  await run(env.DB, "DELETE FROM cost_snapshots WHERE source_type = 'sale_item' AND source_record_id = ?", [recordId]);
  await run(env.DB, 'DELETE FROM sales_record_items WHERE sales_record_id = ?', [recordId]);
  for (const item of items) {
    const itemId = `sri:manual:${newId()}`;
    await run(env.DB, `
      INSERT INTO sales_record_items (
        id, sales_record_id, product_global_id, quantity, unit_price_cents,
        line_amount_cents, unit_cost_cents, line_cogs_cents, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      itemId,
      recordId,
      item.productGlobalId,
      item.quantity,
      item.unitPriceCents,
      item.lineAmountCents,
      item.unitCostCents,
      item.lineCogsCents,
      timestamp
    ]);
    await run(env.DB, `
      INSERT INTO cost_snapshots (
        id, product_global_id, source_type, source_record_id, source_item_id,
        unit_cost_cents, quantity_context, total_cost_cents, effective_at, created_at
      )
      VALUES (?, ?, 'sale_item', ?, ?, ?, ?, ?, ?, ?)
    `, [
      `cs:sale:${itemId}`,
      item.productGlobalId,
      recordId,
      itemId,
      item.unitCostCents,
      item.quantity,
      item.lineCogsCents,
      date,
      timestamp
    ]);
  }
}

async function latestCostCents(env, productGlobalId, date) {
  const row = await first(env.DB, `
    SELECT unit_cost_cents
    FROM cost_snapshots
    WHERE product_global_id = ?
      AND unit_cost_cents > 0
      AND effective_at <= ?
    ORDER BY effective_at DESC, created_at DESC
    LIMIT 1
  `, [productGlobalId, date]);
  return Number(row?.unit_cost_cents) || 0;
}
