import { all } from '../_shared/d1.js';
import { json, methodNotAllowed } from '../_shared/http.js';
import { centsToMoney } from '../_shared/validators.js';
import { SHARED_STOCK_MACHINE_ID, SHARED_STOCK_MACHINE_LABEL } from '../_shared/stock-scope.js';

function inventoryValueCents(row) {
  if ((Number(row.quantity_on_hand) || 0) <= 0) return 0;
  return Math.max(0, Number(row.inventory_value_cents) || 0);
}

export async function onRequestGet(context) {
  const rows = await all(context.env.DB, `
    SELECT
      b.product_id,
      p.name AS product_name,
      b.machine_id,
      CASE WHEN b.machine_id = '${SHARED_STOCK_MACHINE_ID}' THEN '${SHARED_STOCK_MACHINE_LABEL}' ELSE b.machine_id END AS display_machine_id,
      b.quantity_on_hand,
      b.avg_cost_cents,
      COALESCE(pc.purchase_avg_cost_cents, 0) AS purchase_avg_cost_cents,
      b.inventory_value_cents
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
    ) pc ON pc.product_id = b.product_id
    ORDER BY b.machine_id, p.name
  `);
  return json(200, rows.map(row => ({
    productId: row.product_id,
    productName: row.product_name,
    machineId: row.display_machine_id || row.machine_id,
    stockMachineId: row.machine_id,
    quantityOnHand: row.quantity_on_hand,
    avgCost: centsToMoney(Math.max(0, Number(row.avg_cost_cents) || 0)),
    purchaseAvgCost: centsToMoney(row.purchase_avg_cost_cents),
    inventoryValue: centsToMoney(inventoryValueCents(row))
  })));
}

export function onRequest() {
  return methodNotAllowed();
}
