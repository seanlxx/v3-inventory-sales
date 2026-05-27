import {
  absDescBy,
  createResult,
  runD1Query,
  toNumber,
  writeJson
} from './_common.mjs';

const rows = runD1Query(`
  WITH movement_totals AS (
    SELECT
      product_id,
      machine_id,
      SUM(qty_delta) AS movements_net_qty,
      SUM(qty_delta * unit_cost_cents) AS rough_value_cents
    FROM stock_movements
    GROUP BY product_id, machine_id
  ),
  joined AS (
    SELECT
      m.product_id,
      m.machine_id,
      COALESCE(p.name, '') AS product_name,
      COALESCE(p.status, '') AS product_status,
      COALESCE(p.normalized_name, '') AS normalized_name,
      COALESCE(m.movements_net_qty, 0) AS movements_net_qty,
      COALESCE(b.quantity_on_hand, 0) AS balance_qty,
      COALESCE(b.avg_cost_cents, 0) AS avg_cost_cents,
      COALESCE(b.inventory_value_cents, 0) AS inventory_value_cents,
      COALESCE(m.rough_value_cents, 0) AS rough_value_cents
    FROM movement_totals m
    LEFT JOIN inventory_balances b
      ON b.product_id = m.product_id AND b.machine_id = m.machine_id
    LEFT JOIN products p ON p.id = m.product_id
  )
  SELECT
    *,
    movements_net_qty - balance_qty AS drift_qty,
    ABS(movements_net_qty - balance_qty) * avg_cost_cents AS drift_value_cents
  FROM joined
  WHERE movements_net_qty != balance_qty
  ORDER BY ABS(movements_net_qty - balance_qty) DESC, product_name
`);

const normalized = rows
  .map(row => ({
    ...row,
    movements_net_qty: toNumber(row.movements_net_qty),
    balance_qty: toNumber(row.balance_qty),
    drift_qty: toNumber(row.drift_qty),
    avg_cost_cents: toNumber(row.avg_cost_cents),
    inventory_value_cents: toNumber(row.inventory_value_cents),
    drift_value_cents: toNumber(row.drift_value_cents),
    suspected_root_cause: 'R3'
  }))
  .sort(absDescBy('drift_qty'));

const result = createResult({
  check: 'balance-vs-movements',
  rootCause: 'R3',
  rows: normalized,
  summary: {
    drift_sku_count: normalized.length,
    total_abs_drift_qty: normalized.reduce((sum, row) => sum + Math.abs(row.drift_qty), 0),
    total_abs_drift_value_cents: normalized.reduce((sum, row) => sum + Math.abs(row.drift_value_cents), 0)
  }
});

const file = writeJson('balance-vs-movements', result);
console.log(JSON.stringify(result.summary, null, 2));
console.log(`Wrote: ${file}`);
