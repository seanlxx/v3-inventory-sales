import { all } from '../_shared/d1.js';
import { json, methodNotAllowed } from '../_shared/http.js';
import { centsToMoney } from '../_shared/validators.js';

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function addFilter(conditions, params, sql, value) {
  if (value === null || value === undefined || value === '' || value === 'all') return;
  conditions.push(sql);
  params.push(value);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const conditions = ['status = ?'];
  const params = ['active'];

  addFilter(conditions, params, 'product_id = ?', url.searchParams.get('productId'));
  addFilter(conditions, params, 'machine_id = ?', url.searchParams.get('machineId'));
  addFilter(conditions, params, 'category = ?', url.searchParams.get('category'));

  const search = url.searchParams.get('search');
  if (search) {
    conditions.push('(product_name LIKE ? OR product_id LIKE ? OR machine_id LIKE ? OR category LIKE ?)');
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword);
  }

  if (url.searchParams.get('lowStock') === '1') {
    conditions.push('quantity_on_hand <= ?');
    params.push(DEFAULT_LOW_STOCK_THRESHOLD);
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 500, 1), 1000);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  params.push(limit, offset);

  const rows = await all(context.env.DB, `
    WITH balance_rows AS (
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.category,
        p.status,
        b.machine_id,
        b.quantity_on_hand,
        b.avg_cost_cents,
        b.inventory_value_cents,
        b.updated_at
      FROM inventory_balances b
      JOIN products p ON p.id = b.product_id

      UNION ALL

      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.category,
        p.status,
        p.machine_id,
        0 AS quantity_on_hand,
        0 AS avg_cost_cents,
        0 AS inventory_value_cents,
        NULL AS updated_at
      FROM products p
      WHERE NOT EXISTS (
        SELECT 1
        FROM inventory_balances b
        WHERE b.product_id = p.id
      )
    )
    SELECT
      product_id,
      product_name,
      category,
      machine_id,
      quantity_on_hand,
      avg_cost_cents,
      inventory_value_cents,
      updated_at
    FROM balance_rows
    WHERE ${conditions.join(' AND ')}
    ORDER BY machine_id, category, product_name
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
