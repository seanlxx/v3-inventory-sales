import { all, first, placeholders } from './d1.js';
import { centsToMoney } from './validators.js';

const MAX_TREND_DAYS = 90;
const DEFAULT_TREND_DAYS = 30;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MACHINE_ALIASES = new Map([
  ['三号机', '轨道机']
]);

export function normalizeMonth(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 7);
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

function signedCogsSql(column = 'total_cogs_cents') {
  return `CASE WHEN type = 'refund' THEN -${column} ELSE ${column} END`;
}

function normalizeStatus(value) {
  const text = String(value || '').trim();
  return ['active', 'voided', 'all'].includes(text) ? text : 'active';
}

function normalizeSalesType(value) {
  const text = String(value || '').trim();
  return ['sale', 'refund', 'loss', 'all'].includes(text) ? text : 'all';
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
  const params = [];
  const filters = [];
  if (!includeArchived) filters.push("pg.status = 'active'");
  if (search) {
    filters.push('(pg.canonical_name LIKE ? OR pg.normalized_name LIKE ?)');
    params.push(`%${search}%`, `%${search.toLowerCase()}%`);
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
      lastCostAt: row.last_cost_at || null
    };
  });
}

export async function listProfitPurchases(env, options = {}) {
  const month = normalizeMonth(options.month);
  const status = normalizeStatus(options.status);
  const limit = normalizeLimit(options.limit);
  const search = String(options.search || '').trim();
  const filters = ['substr(pr.record_date, 1, 7) = ?'];
  const params = [month];

  if (status !== 'all') {
    filters.push('pr.status = ?');
    params.push(status);
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
    WHERE ${filters.join(' AND ')}
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
  const month = normalizeMonth(options.month);
  const type = normalizeSalesType(options.type);
  const status = normalizeStatus(options.status);
  const machineId = normalizeMachineId(options.machineId);
  const limit = normalizeLimit(options.limit);
  const search = String(options.search || '').trim();
  const machineFilter = machineFilterFor('sr.machine_id', machineId);
  const filters = ['sr.year_month = ?'];
  const params = [month];

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
  params.push(limit);

  const rows = await all(env.DB, `
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
      ${signedCogsSql('sr.total_cogs_cents')} AS signed_cogs_cents,
      sr.gross_profit_cents,
      COALESCE(SUM(sri.quantity), 0) AS quantity,
      COUNT(sri.id) AS item_count
    FROM sales_records sr
    LEFT JOIN sales_record_items sri ON sri.sales_record_id = sr.id
    WHERE ${filters.join(' AND ')}
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
    LIMIT ?
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
  const rows = await all(env.DB, `
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
    WHERE pri.purchase_record_id IN (${placeholders(recordIds.length)})
    ORDER BY pg.canonical_name, pri.id
  `, recordIds);
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
  const rows = await all(env.DB, `
    SELECT
      sri.id,
      sri.sales_record_id,
      sri.product_global_id,
      pg.canonical_name,
      sri.quantity,
      sri.unit_price_cents,
      sri.line_amount_cents,
      sri.unit_cost_cents,
      sri.line_cogs_cents
    FROM sales_record_items sri
    JOIN products_global pg ON pg.id = sri.product_global_id
    WHERE sri.sales_record_id IN (${placeholders(recordIds.length)})
    ORDER BY pg.canonical_name, sri.id
  `, recordIds);
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
      lineCogs: money(row.line_cogs_cents)
    };
    const items = itemMap.get(row.sales_record_id) || [];
    items.push(item);
    itemMap.set(row.sales_record_id, items);
  }
  return itemMap;
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
