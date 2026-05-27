import { all, first } from '../_shared/d1.js';
import { json, methodNotAllowed } from '../_shared/http.js';
import { centsToMoney } from '../_shared/validators.js';
import { SHARED_STOCK_MACHINE_ID, SHARED_STOCK_MACHINE_LABEL, stockMachineIdFor } from '../_shared/stock-scope.js';

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

const MAX_TREND_DAYS = 90;

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeMonth(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : currentMonth();
}

function normalizeDays(value) {
  const days = Math.round(Number(value) || 7);
  return Math.min(Math.max(days, 1), MAX_TREND_DAYS);
}

function normalizeThreshold(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 3;
}

function normalizeFeeRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0.006;
  return number > 1 ? number / 100 : number;
}

function inventoryValueCents(row) {
  if ((Number(row.quantity_on_hand) || 0) <= 0) return 0;
  return Math.max(0, Number(row.inventory_value_cents) || 0);
}

function machineFilterFor(column, machineId) {
  const value = String(machineId || '').trim();
  if (!value) return { sql: '', params: [] };
  if (stockMachineIdFor(value) === SHARED_STOCK_MACHINE_ID) {
    return {
      sql: `AND ${column} IN (?, ?, ?)`,
      params: ['1号机', '2号机', SHARED_STOCK_MACHINE_ID]
    };
  }
  return { sql: `AND ${column} = ?`, params: [value] };
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function getSettingValue(env, key) {
  const row = await first(env.DB, `
    SELECT data
    FROM vending_records
    WHERE store = 'settings' AND record_id = ?
    LIMIT 1
  `, [key]);
  const parsed = safeJsonParse(row?.data || '{}', {});
  return parsed?.value;
}

async function getBusinessSettings(env) {
  const businessSettings = getSettingObject(await getSettingValue(env, 'businessSettings'));
  return {
    feeRate: normalizeFeeRate(
      businessSettings.feeRate ?? await getSettingValue(env, 'feeRate')
    ),
    lowStockThreshold: normalizeThreshold(
      businessSettings.lowStockThreshold ?? await getSettingValue(env, 'lowStockThreshold')
    )
  };
}

function getSettingObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') return safeJsonParse(value, {}) || {};
  return {};
}

function dateSeries(days) {
  const end = new Date(`${todayDate()}T00:00:00.000Z`);
  const start = addDays(end, -(days - 1));
  return Array.from({ length: days }, (_, index) => formatDate(addDays(start, index)));
}

function dateWindowStart(days) {
  const end = new Date(`${todayDate()}T00:00:00.000Z`);
  return formatDate(addDays(end, -(days - 1)));
}

async function getMonthlySales(env, month, machineId) {
  const machineFilter = machineFilterFor('machine_id', machineId);
  const params = [month, ...machineFilter.params];

  return await first(env.DB, `
    SELECT
      COALESCE(SUM(total_amount_cents), 0) AS revenue_cents,
      COALESCE(SUM(received_amount_cents), 0) AS received_cents,
      COALESCE(SUM(total_cogs_cents), 0) AS cogs_cents,
      COALESCE(SUM(CASE WHEN type = 'refund' THEN total_amount_cents ELSE 0 END), 0) AS refunds_cents
    FROM sales_orders
    WHERE voided_at IS NULL
      AND year_month = ?
      ${machineFilter.sql}
  `, params);
}

async function getTodaySales(env, machineId) {
  const machineFilter = machineFilterFor('machine_id', machineId);
  const params = [todayDate(), ...machineFilter.params];

  return await first(env.DB, `
    SELECT COALESCE(SUM(total_amount_cents), 0) AS revenue_cents
    FROM sales_orders
    WHERE voided_at IS NULL
      AND record_date = ?
      ${machineFilter.sql}
  `, params);
}

async function getPurchaseCost(env, month, machineId) {
  const machineFilter = machineFilterFor('o.machine_id', machineId);
  const params = [month, ...machineFilter.params];

  return await first(env.DB, `
    SELECT COALESCE(SUM(i.total_cost_cents), 0) AS purchase_cents
    FROM purchase_orders o
    JOIN purchase_items i ON i.purchase_id = o.id
    WHERE o.voided_at IS NULL
      AND substr(o.record_date, 1, 7) = ?
      ${machineFilter.sql}
  `, params);
}

async function getSalesTrend(env, days, machineId) {
  const startDate = dateWindowStart(days);
  const revenueFilter = machineFilterFor('machine_id', machineId);
  const quantityFilter = machineFilterFor('o.machine_id', machineId);

  const rows = await all(env.DB, `
    WITH revenue_by_date AS (
      SELECT
        record_date AS date,
        COALESCE(SUM(total_amount_cents), 0) AS revenue_cents
      FROM sales_orders
      WHERE voided_at IS NULL
        AND type = 'sale'
        AND record_date >= ?
        ${revenueFilter.sql}
      GROUP BY record_date
    ),
    quantity_by_date AS (
      SELECT
        o.record_date AS date,
        COALESCE(SUM(i.quantity), 0) AS quantity
      FROM sales_orders o
      JOIN sales_items i ON i.sales_order_id = o.id
      WHERE o.voided_at IS NULL
        AND o.type = 'sale'
        AND o.record_date >= ?
        ${quantityFilter.sql}
      GROUP BY o.record_date
    )
    SELECT
      r.date,
      r.revenue_cents,
      COALESCE(q.quantity, 0) AS quantity
    FROM revenue_by_date r
    LEFT JOIN quantity_by_date q ON q.date = r.date
    ORDER BY r.date
  `, [startDate, ...revenueFilter.params, startDate, ...quantityFilter.params]);
  const rowMap = new Map(rows.map(row => [row.date, row]));

  return dateSeries(days).map(date => {
    const row = rowMap.get(date) || {};
    return {
      date,
      revenue: centsToMoney(row.revenue_cents),
      quantity: Number(row.quantity) || 0
    };
  });
}

async function getMachineRanking(env, month) {
  const rows = await all(env.DB, `
    WITH revenue_by_machine AS (
      SELECT
        machine_id,
        COALESCE(SUM(total_amount_cents), 0) AS revenue_cents,
        COALESCE(SUM(received_amount_cents), 0) AS received_cents,
        COALESCE(SUM(total_cogs_cents), 0) AS cogs_cents
      FROM sales_orders
      WHERE voided_at IS NULL
        AND type = 'sale'
        AND year_month = ?
      GROUP BY machine_id
    ),
    quantity_by_machine AS (
      SELECT
        o.machine_id,
        COALESCE(SUM(i.quantity), 0) AS quantity
      FROM sales_orders o
      JOIN sales_items i ON i.sales_order_id = o.id
      WHERE o.voided_at IS NULL
        AND o.type = 'sale'
        AND o.year_month = ?
      GROUP BY o.machine_id
    )
    SELECT
      r.machine_id,
      r.revenue_cents,
      r.received_cents,
      r.cogs_cents,
      COALESCE(q.quantity, 0) AS quantity
    FROM revenue_by_machine r
    LEFT JOIN quantity_by_machine q ON q.machine_id = r.machine_id
    ORDER BY r.revenue_cents DESC
    LIMIT 8
  `, [month, month]);

  return rows.map(row => ({
    machineId: row.machine_id,
    revenue: centsToMoney(row.revenue_cents),
    profit: centsToMoney((Number(row.received_cents) || 0) - (Number(row.cogs_cents) || 0)),
    quantity: Number(row.quantity) || 0
  }));
}

async function getProfitBreakdown(env, month) {
  const rows = await all(env.DB, `
    WITH order_rows AS (
      SELECT
        id,
        CASE
          WHEN machine_id IN ('1号机', '2号机', '${SHARED_STOCK_MACHINE_ID}') THEN '${SHARED_STOCK_MACHINE_ID}'
          ELSE machine_id
        END AS display_machine_id,
        total_amount_cents,
        received_amount_cents,
        total_cogs_cents
      FROM sales_orders
      WHERE voided_at IS NULL
        AND type = 'sale'
        AND year_month = ?
    ),
    totals_by_machine AS (
      SELECT
        display_machine_id,
        COALESCE(SUM(total_amount_cents), 0) AS revenue_cents,
        COALESCE(SUM(received_amount_cents), 0) AS received_cents,
        COALESCE(SUM(total_cogs_cents), 0) AS cogs_cents
      FROM order_rows
      GROUP BY display_machine_id
    ),
    quantity_by_machine AS (
      SELECT
        o.display_machine_id,
        COALESCE(SUM(i.quantity), 0) AS quantity
      FROM order_rows o
      JOIN sales_items i ON i.sales_order_id = o.id
      GROUP BY o.display_machine_id
    )
    SELECT
      t.display_machine_id,
      t.revenue_cents,
      t.received_cents,
      t.cogs_cents,
      COALESCE(q.quantity, 0) AS quantity
    FROM totals_by_machine t
    LEFT JOIN quantity_by_machine q ON q.display_machine_id = t.display_machine_id
    ORDER BY (t.received_cents - t.cogs_cents) DESC, t.revenue_cents DESC
  `, [month]);

  return rows.map(row => ({
    machineId: row.display_machine_id,
    revenue: centsToMoney(row.revenue_cents),
    profit: centsToMoney((Number(row.received_cents) || 0) - (Number(row.cogs_cents) || 0)),
    quantity: Number(row.quantity) || 0
  }));
}

async function getLowStock(env, threshold, machineId) {
  const params = [threshold];
  const stockMachineId = machineId ? stockMachineIdFor(machineId) : '';
  const machineFilter = stockMachineId ? 'AND stock_machine_id = ?' : '';
  if (stockMachineId) params.push(stockMachineId);

  const rows = await all(env.DB, `
    WITH product_rows AS (
      SELECT
        p.*,
        CASE WHEN p.machine_id IN ('1号机', '2号机', '${SHARED_STOCK_MACHINE_ID}') THEN '${SHARED_STOCK_MACHINE_ID}' ELSE p.machine_id END AS stock_machine_id
      FROM products p
    )
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.category,
      p.stock_machine_id AS machine_id,
      CASE WHEN p.stock_machine_id = '${SHARED_STOCK_MACHINE_ID}' THEN '${SHARED_STOCK_MACHINE_LABEL}' ELSE p.stock_machine_id END AS display_machine_id,
      COALESCE(b.quantity_on_hand, 0) AS quantity_on_hand,
      COALESCE(b.avg_cost_cents, 0) AS avg_cost_cents,
      COALESCE(pc.purchase_avg_cost_cents, 0) AS purchase_avg_cost_cents,
      COALESCE(b.inventory_value_cents, 0) AS inventory_value_cents,
      b.updated_at
    FROM product_rows p
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id
     AND b.machine_id = p.stock_machine_id
    LEFT JOIN (
      SELECT
        i.product_id,
        CASE
          WHEN COALESCE(SUM(i.quantity), 0) > 0
          THEN ROUND(COALESCE(SUM(i.total_cost_cents), 0) * 1.0 / SUM(i.quantity))
          ELSE 0
        END AS purchase_avg_cost_cents
      FROM purchase_items i
      JOIN purchase_orders o ON o.id = i.purchase_id
      WHERE o.voided_at IS NULL
      GROUP BY i.product_id
    ) pc ON pc.product_id = p.id
    WHERE p.status = 'active'
      AND COALESCE(b.quantity_on_hand, 0) <= ?
      ${machineFilter}
    ORDER BY COALESCE(b.quantity_on_hand, 0), p.stock_machine_id, p.name
    LIMIT 20
  `, params);

  return rows.map(row => ({
    productId: row.product_id,
    productName: row.product_name,
    machineId: row.display_machine_id || row.machine_id,
    stockMachineId: row.machine_id,
    category: row.category || '其他',
    quantityOnHand: Number(row.quantity_on_hand) || 0,
    avgCost: centsToMoney(Math.max(0, Number(row.avg_cost_cents) || 0)),
    purchaseAvgCost: centsToMoney(row.purchase_avg_cost_cents),
    inventoryValue: centsToMoney(inventoryValueCents(row)),
    lowStockThreshold: threshold,
    isLowStock: true,
    updatedAt: row.updated_at || null
  }));
}

async function getRecentExceptions(env, threshold, machineId) {
  const params = [threshold];
  const stockMachineId = machineId ? stockMachineIdFor(machineId) : '';
  const machineFilter = stockMachineId ? 'AND stock_machine_id = ?' : '';
  if (stockMachineId) params.push(stockMachineId);

  const lowStockRows = await all(env.DB, `
    WITH product_rows AS (
      SELECT
        p.*,
        CASE WHEN p.machine_id IN ('1号机', '2号机', '${SHARED_STOCK_MACHINE_ID}') THEN '${SHARED_STOCK_MACHINE_ID}' ELSE p.machine_id END AS stock_machine_id
      FROM products p
    )
    SELECT
      p.id,
      p.name,
      p.stock_machine_id AS machine_id,
      CASE WHEN p.stock_machine_id = '${SHARED_STOCK_MACHINE_ID}' THEN '${SHARED_STOCK_MACHINE_LABEL}' ELSE p.stock_machine_id END AS display_machine_id,
      COALESCE(b.quantity_on_hand, 0) AS quantity_on_hand,
      COALESCE(b.updated_at, p.updated_at) AS occurred_at
    FROM product_rows p
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id
     AND b.machine_id = p.stock_machine_id
    WHERE p.status = 'active'
      AND COALESCE(b.quantity_on_hand, 0) <= ?
      ${machineFilter}
    ORDER BY COALESCE(b.updated_at, p.updated_at) DESC
    LIMIT 6
  `, params);

  const orderMachineFilter = machineFilterFor('machine_id', machineId);
  const orderRows = await all(env.DB, `
    SELECT id, type, record_date, machine_id, voided_at, created_at
    FROM sales_orders
    WHERE (type IN ('refund', 'loss') OR voided_at IS NOT NULL)
      ${orderMachineFilter.sql}
    ORDER BY COALESCE(voided_at, created_at) DESC
    LIMIT 8
  `, orderMachineFilter.params);

  return [
    ...orderRows.map(row => {
      const type = row.voided_at ? 'void' : row.type;
      const label = type === 'refund' ? '退款单' : type === 'loss' ? '损耗单' : '作废单据';
      return {
        id: row.id,
        type,
        title: `${label} · ${row.machine_id}`,
        occurredAt: row.voided_at || row.created_at || row.record_date,
        refType: 'sales_order',
        refId: row.id
      };
    }),
    ...lowStockRows.map(row => ({
      id: `low-stock:${row.id}:${row.machine_id}`,
      type: 'low_stock',
      title: `${row.name} 库存 ${Number(row.quantity_on_hand) || 0} 件`,
      occurredAt: row.occurred_at,
      refType: 'product',
      refId: row.id
    }))
  ]
    .sort((left, right) => String(right.occurredAt || '').localeCompare(String(left.occurredAt || '')))
    .slice(0, 10);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const month = normalizeMonth(url.searchParams.get('month'));
  const days = normalizeDays(url.searchParams.get('days'));
  const machineId = String(url.searchParams.get('machineId') || '').trim();
  const effectiveMachineId = machineId && machineId !== 'all' ? machineId : '';
  const settings = await getBusinessSettings(context.env);

  const [
    monthlySales,
    todaySales,
    purchaseCost,
    salesTrend,
    machineRanking,
    profitBreakdown,
    lowStock
  ] = await Promise.all([
    getMonthlySales(context.env, month, effectiveMachineId),
    getTodaySales(context.env, effectiveMachineId),
    getPurchaseCost(context.env, month, effectiveMachineId),
    getSalesTrend(context.env, days, effectiveMachineId),
    getMachineRanking(context.env, month),
    getProfitBreakdown(context.env, month),
    getLowStock(context.env, settings.lowStockThreshold, effectiveMachineId)
  ]);

  const monthRevenue = centsToMoney(monthlySales?.revenue_cents);
  const monthReceived = centsToMoney(monthlySales?.received_cents);
  const monthCogs = centsToMoney(monthlySales?.cogs_cents);
  const monthGrossProfit = Math.round((monthReceived - monthCogs) * 100) / 100;

  return json(200, {
    month,
    kpis: {
      todayRevenue: centsToMoney(todaySales?.revenue_cents),
      monthRevenue,
      monthReceived,
      monthCogs,
      monthGrossProfit,
      profitRate: monthReceived > 0 ? (monthGrossProfit / monthReceived) * 100 : 0,
      purchaseCost: centsToMoney(purchaseCost?.purchase_cents),
      refunds: centsToMoney(monthlySales?.refunds_cents),
      lowStockCount: lowStock.length
    },
    salesTrend,
    machineRanking,
    profitBreakdown,
    lowStock,
    recentExceptions: await getRecentExceptions(context.env, settings.lowStockThreshold, effectiveMachineId)
  });
}

export function onRequest() {
  return methodNotAllowed();
}
