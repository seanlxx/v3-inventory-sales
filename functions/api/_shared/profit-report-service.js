import { all, first } from './d1.js';
import { centsToMoney } from './validators.js';
import { normalizeDays, normalizeLimit, normalizeMachineId, normalizeMonth } from './profit-normalize.js';

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

function signedCogsSql(column = 'total_cogs_cents', typeColumn = 'type') {
  return `CASE WHEN ${typeColumn} = 'refund' THEN -${column} ELSE ${column} END`;
}

function toSummaryKpis(row) {
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
    purchaseCost: money(row?.purchase_cost_cents),
    orderCount: Number(row?.order_count) || 0,
    quantity: Number(row?.quantity) || 0,
    missingCostProductCount: Number(row?.missing_cost_product_count) || 0,
    mergedProductCount: Number(row?.merged_product_count) || 0
  };
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

export async function getProfitSummary(env, options = {}) {
  const month = normalizeMonth(options.month);
  const days = normalizeDays(options.days);
  const machineId = normalizeMachineId(options.machineId);
  const [
    summaryKpis,
    dailyTrend,
    dailyTrendByMachine,
    machineRanking,
    productRanking,
    costGaps,
    productMerges
  ] = await Promise.all([
    getSummaryKpis(env, month, machineId),
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
    kpis: toSummaryKpis(summaryKpis),
    dailyTrend,
    dailyTrendByMachine,
    machineRanking,
    productRanking,
    costGaps,
    productMerges
  };
}

async function getSummaryKpis(env, month, machineId) {
  const totalsFilter = machineFilterFor('sales.machine_id', machineId);
  const quantityFilter = machineFilterFor('quantity_sales.machine_id', machineId);
  const gapFilter = machineFilterFor('gap_sales.machine_id', machineId);
  return await first(env.DB, `
    WITH sales_totals AS (
      SELECT
        COUNT(*) AS order_count,
        COALESCE(SUM(sales.gross_amount_cents), 0) AS gross_sales_cents,
        COALESCE(SUM(sales.refund_amount_cents), 0) AS refunds_cents,
        COALESCE(SUM(sales.platform_fee_cents + sales.service_fee_cents), 0) AS fees_cents,
        COALESCE(SUM(sales.discount_cents), 0) AS discounts_cents,
        COALESCE(SUM(sales.net_revenue_cents), 0) AS net_revenue_cents,
        COALESCE(SUM(${signedCogsSql('sales.total_cogs_cents', 'sales.type')}), 0) AS cogs_cents,
        COALESCE(SUM(sales.gross_profit_cents), 0) AS gross_profit_cents
      FROM sales_records sales
      WHERE sales.year_month = ?
        AND sales.status = 'active'
        AND sales.type IN ('sale', 'refund')
        ${totalsFilter.sql}
    ),
    quantity_totals AS (
      SELECT COALESCE(SUM(quantity_items.quantity), 0) AS quantity
      FROM sales_records quantity_sales
      JOIN sales_record_items quantity_items ON quantity_items.sales_record_id = quantity_sales.id
      WHERE quantity_sales.year_month = ?
        AND quantity_sales.status = 'active'
        AND quantity_sales.type = 'sale'
        ${quantityFilter.sql}
    ),
    purchase_totals AS (
      SELECT COALESCE(SUM(purchase_items.total_cost_cents), 0) AS purchase_cost_cents
      FROM purchase_records purchases
      JOIN purchase_record_items purchase_items ON purchase_items.purchase_record_id = purchases.id
      WHERE purchases.status = 'active'
        AND substr(purchases.record_date, 1, 7) = ?
    ),
    gap_products AS (
      SELECT gap_items.product_global_id
      FROM sales_records gap_sales
      JOIN sales_record_items gap_items ON gap_items.sales_record_id = gap_sales.id
      LEFT JOIN (
        SELECT product_global_id, COUNT(*) AS cost_snapshot_count
        FROM cost_snapshots
        WHERE unit_cost_cents > 0
          OR source_type = 'manual_cost'
        GROUP BY product_global_id
      ) snapshots ON snapshots.product_global_id = gap_items.product_global_id
      WHERE gap_sales.year_month = ?
        AND gap_sales.status = 'active'
        AND gap_sales.type = 'sale'
        AND gap_items.unit_cost_cents = 0
        ${gapFilter.sql}
      GROUP BY gap_items.product_global_id
      HAVING COALESCE(MAX(snapshots.cost_snapshot_count), 0) = 0
    ),
    gap_totals AS (
      SELECT COUNT(*) AS missing_cost_product_count FROM gap_products
    ),
    merge_totals AS (
      SELECT COUNT(*) AS merged_product_count
      FROM products_global
      WHERE legacy_product_count > 1
    )
    SELECT
      sales_totals.*,
      quantity_totals.quantity,
      purchase_totals.purchase_cost_cents,
      gap_totals.missing_cost_product_count,
      merge_totals.merged_product_count
    FROM sales_totals
    CROSS JOIN quantity_totals
    CROSS JOIN purchase_totals
    CROSS JOIN gap_totals
    CROSS JOIN merge_totals
  `, [
    month,
    ...totalsFilter.params,
    month,
    ...quantityFilter.params,
    month,
    month,
    ...gapFilter.params
  ]);
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
    WITH item_base AS (
      SELECT
        pg.id AS productGlobalId,
        pg.canonical_name AS productName,
        sr.id AS sales_record_id,
        sr.type,
        sr.gross_amount_cents,
        sr.refund_amount_cents,
        sr.platform_fee_cents + sr.service_fee_cents + sr.discount_cents AS deduction_cents,
        sri.quantity,
        sri.line_amount_cents,
        sri.line_cogs_cents,
        SUM(sri.line_amount_cents) OVER (PARTITION BY sr.id) AS record_line_amount_cents
      FROM sales_records sr
      JOIN sales_record_items sri ON sri.sales_record_id = sr.id
      JOIN products_global pg ON pg.id = sri.product_global_id
      WHERE sr.year_month = ?
        AND sr.status = 'active'
        AND sr.type IN ('sale', 'refund')
        ${filter.sql}
    ),
    item_allocated AS (
      SELECT
        productGlobalId,
        productName,
        type,
        quantity,
        line_amount_cents,
        line_cogs_cents,
        CASE
          WHEN record_line_amount_cents > 0 THEN
            ROUND(line_amount_cents * 1.0 * CASE WHEN type = 'refund' THEN refund_amount_cents ELSE gross_amount_cents END / record_line_amount_cents)
          ELSE 0
        END AS allocated_revenue_cents,
        CASE
          WHEN record_line_amount_cents > 0 THEN
            ROUND(line_amount_cents * 1.0 * deduction_cents / record_line_amount_cents)
          ELSE 0
        END AS allocated_deduction_cents
      FROM item_base
    ),
    product_totals AS (
      SELECT
        productGlobalId,
        productName,
        COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END), 0) AS quantity,
        COALESCE(SUM(CASE WHEN type = 'sale' THEN allocated_revenue_cents ELSE -allocated_revenue_cents END), 0) AS sales_amount_cents,
        COALESCE(SUM(CASE WHEN type = 'sale' THEN allocated_revenue_cents - allocated_deduction_cents ELSE -allocated_revenue_cents - allocated_deduction_cents END), 0) AS net_revenue_cents,
        COALESCE(SUM(CASE WHEN type = 'sale' THEN line_cogs_cents ELSE -line_cogs_cents END), 0) AS cogs_cents
      FROM item_allocated
      GROUP BY productGlobalId, productName
    )
    SELECT
      productGlobalId,
      productName,
      quantity,
      sales_amount_cents,
      net_revenue_cents,
      cogs_cents,
      net_revenue_cents - cogs_cents AS net_profit_cents
    FROM product_totals
    ORDER BY net_profit_cents DESC
    LIMIT 20
  `, [month, ...filter.params]);

  return rows.map(row => {
    const netProfitCents = Number(row.net_profit_cents) || 0;
    return {
      productGlobalId: row.productGlobalId,
      productName: row.productName,
      quantity: Number(row.quantity) || 0,
      salesAmount: money(row.sales_amount_cents),
      netRevenue: money(row.net_revenue_cents),
      cogs: money(row.cogs_cents),
      grossProfit: money(netProfitCents),
      netProfit: money(netProfitCents),
      profitRate: profitRatePercent(row.net_revenue_cents, netProfitCents)
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
