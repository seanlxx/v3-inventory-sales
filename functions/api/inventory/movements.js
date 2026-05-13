import { all } from '../_shared/d1.js';
import { json, methodNotAllowed } from '../_shared/http.js';
import { centsToMoney } from '../_shared/validators.js';

function addFilter(conditions, params, sql, value) {
  if (value === null || value === undefined || value === '') return;
  conditions.push(sql);
  params.push(value);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const conditions = [];
  const params = [];

  addFilter(conditions, params, 'm.product_id = ?', url.searchParams.get('productId'));
  addFilter(conditions, params, 'm.machine_id = ?', url.searchParams.get('machineId'));
  addFilter(conditions, params, 'm.movement_type = ?', url.searchParams.get('movementType'));
  addFilter(conditions, params, 'm.ref_type = ?', url.searchParams.get('refType'));
  addFilter(conditions, params, 'm.ref_id = ?', url.searchParams.get('refId'));
  addFilter(conditions, params, 'm.created_at >= ?', url.searchParams.get('dateFrom'));
  addFilter(conditions, params, 'm.created_at <= ?', url.searchParams.get('dateTo'));

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  params.push(limit, offset);

  const rows = await all(context.env.DB, `
    SELECT
      m.*,
      p.name AS product_name
    FROM stock_movements m
    JOIN products p ON p.id = m.product_id
    ${where}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ? OFFSET ?
  `, params);

  return json(200, rows.map(row => ({
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    machineId: row.machine_id,
    movementType: row.movement_type,
    qtyDelta: Number(row.qty_delta) || 0,
    unitCost: centsToMoney(row.unit_cost_cents),
    refType: row.ref_type,
    refId: row.ref_id,
    refItemId: row.ref_item_id || null,
    voidsMovementId: row.voids_movement_id || null,
    createdAt: row.created_at
  })));
}

export function onRequest() {
  return methodNotAllowed();
}
