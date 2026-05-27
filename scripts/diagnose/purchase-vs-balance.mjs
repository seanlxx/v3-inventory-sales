import {
  absDescBy,
  createResult,
  runD1Query,
  toNumber,
  writeJson
} from './_common.mjs';

const rows = runD1Query(`
  WITH keys AS (
    SELECT product_id, machine_id FROM inventory_balances
    UNION
    SELECT product_id, machine_id FROM stock_movements
  ),
  purch AS (
    SELECT
      m.product_id,
      m.machine_id,
      SUM(pi.quantity) AS purchase_qty,
      SUM(pi.total_cost_cents) AS purchase_cost_cents
    FROM stock_movements m
    JOIN purchase_items pi ON pi.id = m.ref_item_id
    JOIN purchase_orders po ON po.id = pi.purchase_id
    WHERE m.movement_type = 'purchase'
      AND m.ref_type = 'purchase_order'
      AND po.voided_at IS NULL
    GROUP BY m.product_id, m.machine_id
  ),
  mov AS (
    SELECT
      product_id,
      machine_id,
      SUM(CASE WHEN movement_type = 'sale' THEN ABS(qty_delta) ELSE 0 END) AS sale_qty,
      SUM(CASE WHEN movement_type = 'loss' THEN ABS(qty_delta) ELSE 0 END) AS loss_qty,
      SUM(CASE WHEN movement_type = 'refund' THEN qty_delta ELSE 0 END) AS refund_qty,
      SUM(CASE WHEN movement_type = 'transfer_out' THEN ABS(qty_delta) ELSE 0 END) AS transfer_out_qty,
      SUM(CASE WHEN movement_type = 'transfer_in' THEN qty_delta ELSE 0 END) AS transfer_in_qty,
      SUM(CASE WHEN movement_type = 'adjustment' THEN qty_delta ELSE 0 END) AS adjustment_qty,
      SUM(CASE WHEN movement_type = 'void' THEN qty_delta ELSE 0 END) AS void_qty,
      SUM(qty_delta) AS movements_net_qty
    FROM stock_movements
    GROUP BY product_id, machine_id
  ),
  product_machine_counts AS (
    SELECT product_id, COUNT(DISTINCT machine_id) AS machine_count
    FROM inventory_balances
    GROUP BY product_id
  ),
  voided_sales AS (
    SELECT si.product_id, so.machine_id, COUNT(*) AS voided_sales_items
    FROM sales_items si
    JOIN sales_orders so ON so.id = si.sales_order_id
    WHERE so.voided_at IS NOT NULL
    GROUP BY si.product_id, so.machine_id
  )
  SELECT
    k.product_id,
    k.machine_id,
    COALESCE(p.name, '') AS product_name,
    COALESCE(p.status, '') AS product_status,
    COALESCE(p.normalized_name, '') AS normalized_name,
    COALESCE(purch.purchase_qty, 0) AS purchase_qty,
    COALESCE(purch.purchase_cost_cents, 0) AS purchase_cost_cents,
    COALESCE(b.quantity_on_hand, 0) AS balance_qty,
    COALESCE(b.avg_cost_cents, 0) AS avg_cost_cents,
    COALESCE(mov.sale_qty, 0) AS sale_qty,
    COALESCE(mov.loss_qty, 0) AS loss_qty,
    COALESCE(mov.refund_qty, 0) AS refund_qty,
    COALESCE(mov.transfer_out_qty, 0) AS transfer_out_qty,
    COALESCE(mov.transfer_in_qty, 0) AS transfer_in_qty,
    COALESCE(mov.adjustment_qty, 0) AS adjustment_qty,
    COALESCE(mov.void_qty, 0) AS void_qty,
    COALESCE(mov.movements_net_qty, 0) AS movements_net_qty,
    COALESCE(product_machine_counts.machine_count, 0) AS product_machine_count,
    COALESCE(voided_sales.voided_sales_items, 0) AS voided_sales_items,
    COALESCE(purch.purchase_qty, 0)
      - COALESCE(mov.sale_qty, 0)
      - COALESCE(mov.loss_qty, 0)
      + COALESCE(mov.refund_qty, 0)
      - COALESCE(mov.transfer_out_qty, 0)
      + COALESCE(mov.transfer_in_qty, 0)
      + COALESCE(mov.adjustment_qty, 0)
      + COALESCE(mov.void_qty, 0) AS expected_balance_qty
  FROM keys k
  LEFT JOIN purch ON purch.product_id = k.product_id AND purch.machine_id = k.machine_id
  LEFT JOIN mov ON mov.product_id = k.product_id AND mov.machine_id = k.machine_id
  LEFT JOIN inventory_balances b ON b.product_id = k.product_id AND b.machine_id = k.machine_id
  LEFT JOIN products p ON p.id = k.product_id
  LEFT JOIN product_machine_counts ON product_machine_counts.product_id = k.product_id
  LEFT JOIN voided_sales ON voided_sales.product_id = k.product_id AND voided_sales.machine_id = k.machine_id
`);

function inferRootCause(row) {
  if (row.drift_qty === 0) return null;
  if (row.adjustment_qty !== 0) return 'R6';
  if (row.product_machine_count > 1 || String(row.machine_id || '').includes('1/2')) return 'R2';
  if (row.voided_sales_items > 0 || row.void_qty !== 0) return 'R5';
  return 'unknown';
}

const mismatches = rows
  .map(row => {
    const purchaseQty = toNumber(row.purchase_qty);
    const balanceQty = toNumber(row.balance_qty);
    const saleQty = toNumber(row.sale_qty);
    const lossQty = toNumber(row.loss_qty);
    const refundQty = toNumber(row.refund_qty);
    const transferOutQty = toNumber(row.transfer_out_qty);
    const transferInQty = toNumber(row.transfer_in_qty);
    const adjustmentQty = toNumber(row.adjustment_qty);
    const voidQty = toNumber(row.void_qty);
    const expectedBalanceQty = toNumber(row.expected_balance_qty);
    const driftQty = expectedBalanceQty - balanceQty;
    const avgCost = toNumber(row.avg_cost_cents);
    const mapped = {
      ...row,
      purchase_qty: purchaseQty,
      purchase_cost_cents: toNumber(row.purchase_cost_cents),
      balance_qty: balanceQty,
      avg_cost_cents: avgCost,
      sale_qty: saleQty,
      loss_qty: lossQty,
      refund_qty: refundQty,
      transfer_out_qty: transferOutQty,
      transfer_in_qty: transferInQty,
      adjustment_qty: adjustmentQty,
      void_qty: voidQty,
      movements_net_qty: toNumber(row.movements_net_qty),
      product_machine_count: toNumber(row.product_machine_count),
      voided_sales_items: toNumber(row.voided_sales_items),
      expected_qty_from_balance_and_outflow: expectedBalanceQty,
      drift_qty: driftQty,
      drift_value_cents: Math.abs(driftQty) * avgCost
    };
    mapped.suspected_root_cause = inferRootCause(mapped);
    return mapped;
  })
  .filter(row => row.drift_qty !== 0)
  .sort(absDescBy('drift_qty'));

const byCause = mismatches.reduce((acc, row) => {
  acc[row.suspected_root_cause] = (acc[row.suspected_root_cause] || 0) + 1;
  return acc;
}, {});

const result = createResult({
  check: 'purchase-vs-balance',
  rootCause: 'R6',
  rows: mismatches,
  summary: {
    drift_sku_count: mismatches.length,
    total_abs_drift_qty: mismatches.reduce((sum, row) => sum + Math.abs(row.drift_qty), 0),
    total_abs_drift_value_cents: mismatches.reduce((sum, row) => sum + Math.abs(row.drift_value_cents), 0),
    suspected_root_causes: byCause
  }
});

const file = writeJson('purchase-vs-balance', result);
console.log(JSON.stringify(result.summary, null, 2));
console.log(`Wrote: ${file}`);
