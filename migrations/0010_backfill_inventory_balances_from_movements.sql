PRAGMA foreign_keys = ON;

INSERT INTO inventory_balances (
  product_id,
  machine_id,
  quantity_on_hand,
  avg_cost_cents,
  inventory_value_cents,
  total_purchase_qty,
  total_purchase_cost_cents,
  updated_at
)
WITH valued_movements AS (
  SELECT
    m.product_id,
    m.machine_id,
    m.qty_delta,
    m.created_at,
    CASE
      WHEN m.movement_type = 'purchase' THEN COALESCE(pi.total_cost_cents, m.qty_delta * m.unit_cost_cents)
      WHEN m.movement_type IN ('sale', 'loss') THEN -COALESCE(si.line_cogs_cents, ABS(m.qty_delta) * m.unit_cost_cents)
      WHEN m.movement_type = 'refund' THEN COALESCE(si.line_cogs_cents, ABS(m.qty_delta) * m.unit_cost_cents)
      WHEN m.movement_type = 'adjustment' THEN m.qty_delta * m.unit_cost_cents
      WHEN m.movement_type = 'void' AND voided.movement_type = 'purchase' THEN -COALESCE(voided_pi.total_cost_cents, ABS(voided.qty_delta) * voided.unit_cost_cents)
      WHEN m.movement_type = 'void' AND voided.movement_type IN ('sale', 'loss') THEN COALESCE(voided_si.line_cogs_cents, ABS(voided.qty_delta) * voided.unit_cost_cents)
      WHEN m.movement_type = 'void' AND voided.movement_type = 'refund' THEN -COALESCE(voided_si.line_cogs_cents, ABS(voided.qty_delta) * voided.unit_cost_cents)
      ELSE m.qty_delta * m.unit_cost_cents
    END AS value_delta_cents,
    CASE
      WHEN m.movement_type = 'purchase' THEN m.qty_delta
      WHEN m.movement_type = 'void' AND voided.movement_type = 'purchase' THEN m.qty_delta
      ELSE 0
    END AS purchase_qty_delta,
    CASE
      WHEN m.movement_type = 'purchase' THEN COALESCE(pi.total_cost_cents, m.qty_delta * m.unit_cost_cents)
      WHEN m.movement_type = 'void' AND voided.movement_type = 'purchase' THEN -COALESCE(voided_pi.total_cost_cents, ABS(voided.qty_delta) * voided.unit_cost_cents)
      ELSE 0
    END AS purchase_cost_delta_cents
  FROM stock_movements m
  LEFT JOIN stock_movements voided ON voided.id = m.voids_movement_id
  LEFT JOIN purchase_items pi ON pi.id = m.ref_item_id
  LEFT JOIN purchase_items voided_pi ON voided_pi.id = voided.ref_item_id
  LEFT JOIN sales_items si ON si.id = m.ref_item_id
  LEFT JOIN sales_items voided_si ON voided_si.id = voided.ref_item_id
),
movement_totals AS (
  SELECT
    product_id,
    machine_id,
    SUM(qty_delta) AS quantity_on_hand,
    SUM(value_delta_cents) AS inventory_value_cents,
    SUM(purchase_qty_delta) AS total_purchase_qty,
    SUM(purchase_cost_delta_cents) AS total_purchase_cost_cents,
    MAX(created_at) AS updated_at
  FROM valued_movements
  GROUP BY product_id, machine_id
)
SELECT
  product_id,
  machine_id,
  CAST(quantity_on_hand AS INTEGER),
  CASE
    WHEN quantity_on_hand = 0 THEN 0
    ELSE CAST(ROUND(1.0 * inventory_value_cents / quantity_on_hand) AS INTEGER)
  END,
  CASE
    WHEN quantity_on_hand = 0 THEN 0
    ELSE CAST(inventory_value_cents AS INTEGER)
  END,
  CAST(total_purchase_qty AS INTEGER),
  CAST(total_purchase_cost_cents AS INTEGER),
  updated_at
FROM movement_totals totals
WHERE NOT EXISTS (
  SELECT 1
  FROM inventory_balances b
  WHERE b.product_id = totals.product_id
    AND b.machine_id = totals.machine_id
)
  AND (
    quantity_on_hand != 0
    OR inventory_value_cents != 0
    OR total_purchase_qty != 0
    OR total_purchase_cost_cents != 0
  );
