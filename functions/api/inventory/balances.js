import { all } from '../_shared/d1.js';
import { json, methodNotAllowed } from '../_shared/http.js';
import { centsToMoney } from '../_shared/validators.js';

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function addFilter(conditions, params, sql, value) {
  if (value === null || value === undefined || value === '') return;
  conditions.push(sql);
  params.push(value);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const conditions = ["p.status = 'active'"];
  const params = [];

  addFilter(conditions, params, 'p.id = ?', url.searchParams.get('productId'));
  addFilter(conditions, params, 'COALESCE(b.machine_id, p.machine_id) = ?', url.searchParams.get('machineId'));
  addFilter(conditions, params, 'p.category = ?', url.searchParams.get('category'));

  const search = url.searchParams.get('search');
  if (search) {
    conditions.push('(p.name LIKE ? OR p.id LIKE ? OR b.machine_id LIKE ? OR p.category LIKE ?)');
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword);
  }

  if (url.searchParams.get('lowStock') === '1') {
    conditions.push('COALESCE(b.quantity_on_hand, 0) <= ?');
    params.push(DEFAULT_LOW_STOCK_THRESHOLD);
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 500, 1), 1000);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  params.push(limit, offset);

  const rows = await all(context.env.DB, `
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.category,
      COALESCE(b.machine_id, p.machine_id) AS machine_id,
      COALESCE(b.quantity_on_hand, 0) AS quantity_on_hand,
      COALESCE(b.avg_cost_cents, 0) AS avg_cost_cents,
      COALESCE(b.inventory_value_cents, 0) AS inventory_value_cents,
      b.updated_at
    FROM products p
    LEFT JOIN inventory_balances b
      ON b.product_id = p.id
     AND b.machine_id = p.machine_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY COALESCE(b.machine_id, p.machine_id), p.category, p.name
    LIMIT ? OFFSET ?
  `, params);

  return json(200, rows.map(row => ({
    productId: row.product_id,
    productName: row.product_name,
    machineId: row.machine_id,
    category: row.category || '其他',
    quantityOnHand: Number(row.quantity_on_hand) || 0,
    avgCost: centsToMoney(row.avg_cost_cents),
    inventoryValue: centsToMoney(row.inventory_value_cents),
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    isLowStock: (Number(row.quantity_on_hand) || 0) <= DEFAULT_LOW_STOCK_THRESHOLD,
    updatedAt: row.updated_at || null
  })));
}

export function onRequest() {
  return methodNotAllowed();
}
