import { all } from '../_shared/d1.js';
import { json, methodNotAllowed } from '../_shared/http.js';
import { centsToMoney } from '../_shared/validators.js';

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

function addFilter(conditions, params, sql, value) {
  if (value === null || value === undefined || value === '' || value === 'all') return;
  conditions.push(sql);
  params.push(value);
}

function inventoryValueCents(row) {
  if ((Number(row.quantity_on_hand) || 0) <= 0) return 0;
  return Math.max(0, Number(row.inventory_value_cents) || 0);
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const conditions = ['status = ?'];
  const params = ['active'];

  addFilter(conditions, params, 'product_id = ?', url.searchParams.get('productId'));
  const machineId = url.searchParams.get('machineId');
  addFilter(conditions, params, 'machine_id = ?', machineId);
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
        COALESCE(pc.purchase_avg_cost_cents, 0) AS purchase_avg_cost_cents,
        b.inventory_value_cents,
        b.updated_at
      FROM inventory_balances b
      JOIN products p ON p.id = b.product_id
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

      UNION ALL

      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.category,
        p.status,
        CASE
          WHEN p.machine_id IN ('1/2号机', '1/2号机总库存', '总库存') THEN '1号机'
          ELSE p.machine_id
        END AS machine_id,
        0 AS quantity_on_hand,
        0 AS avg_cost_cents,
        COALESCE(pc.purchase_avg_cost_cents, 0) AS purchase_avg_cost_cents,
        0 AS inventory_value_cents,
        NULL AS updated_at
      FROM (
        SELECT
          p.*
        FROM products p
      ) p
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
      WHERE NOT EXISTS (
        SELECT 1
        FROM inventory_balances b
        WHERE b.product_id = p.id
          AND b.machine_id = CASE
            WHEN p.machine_id IN ('1/2号机', '1/2号机总库存', '总库存') THEN '1号机'
            ELSE p.machine_id
          END
      )
        AND NOT (
          p.machine_id IN ('1/2号机', '1/2号机总库存', '总库存')
          AND EXISTS (
            SELECT 1
            FROM inventory_balances b
            WHERE b.product_id = p.id
          )
        )
    )
    SELECT
      product_id,
      product_name,
      category,
      machine_id,
      quantity_on_hand,
      avg_cost_cents,
      purchase_avg_cost_cents,
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
    stockMachineId: row.machine_id,
    category: row.category || '其他',
    quantityOnHand: Number(row.quantity_on_hand) || 0,
    avgCost: centsToMoney(Math.max(0, Number(row.avg_cost_cents) || 0)),
    purchaseAvgCost: centsToMoney(row.purchase_avg_cost_cents),
    inventoryValue: centsToMoney(inventoryValueCents(row)),
    lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    isLowStock: (Number(row.quantity_on_hand) || 0) <= DEFAULT_LOW_STOCK_THRESHOLD,
    updatedAt: row.updated_at || null
  })));
}

export function onRequest() {
  return methodNotAllowed();
}
