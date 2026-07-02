-- 1/2/3 号机共用总库存；轨道机独立库存，"三号机" 是轨道机旧名称。

UPDATE products
SET machine_id = '轨道机',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE machine_id = '三号机';

UPDATE products
SET machine_id = '1号机',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE machine_id IN ('1/2号机', '1/2号机总库存', '总库存')
  AND (
    normalized_name IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM products target
      WHERE target.id != products.id
        AND target.machine_id = '1号机'
        AND target.normalized_name = products.normalized_name
    )
  )
  AND (
    external_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM products target
      WHERE target.id != products.id
        AND target.machine_id = '1号机'
        AND target.external_id = products.external_id
    )
  );

UPDATE sales_orders
SET machine_id = '轨道机',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE machine_id = '三号机';

UPDATE purchase_orders
SET machine_id = '轨道机',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE machine_id = '三号机';

UPDATE stock_movements
SET machine_id = '轨道机'
WHERE machine_id = '三号机';

UPDATE stock_transfers
SET from_machine_id = '轨道机'
WHERE from_machine_id = '三号机';

UPDATE stock_transfers
SET to_machine_id = '轨道机'
WHERE to_machine_id = '三号机';

CREATE TEMP TABLE __track_inventory_balances AS
SELECT
  product_id,
  '轨道机' AS machine_id,
  SUM(quantity_on_hand) AS quantity_on_hand,
  CASE
    WHEN SUM(quantity_on_hand) <= 0 THEN 0
    ELSE ROUND(SUM(inventory_value_cents) * 1.0 / SUM(quantity_on_hand))
  END AS avg_cost_cents,
  SUM(inventory_value_cents) AS inventory_value_cents,
  SUM(total_purchase_qty) AS total_purchase_qty,
  SUM(total_purchase_cost_cents) AS total_purchase_cost_cents,
  MAX(updated_at) AS updated_at
FROM inventory_balances
WHERE machine_id IN ('轨道机', '三号机')
GROUP BY product_id;

DELETE FROM inventory_balances
WHERE machine_id IN ('轨道机', '三号机');

INSERT INTO inventory_balances (
  product_id, machine_id, quantity_on_hand, avg_cost_cents, inventory_value_cents,
  total_purchase_qty, total_purchase_cost_cents, updated_at
)
SELECT
  product_id, machine_id, quantity_on_hand, avg_cost_cents,
  CASE WHEN quantity_on_hand <= 0 THEN 0 ELSE inventory_value_cents END,
  total_purchase_qty, total_purchase_cost_cents,
  COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM __track_inventory_balances;

DROP TABLE __track_inventory_balances;

CREATE TEMP TABLE __shared_inventory_balances AS
SELECT
  product_id,
  '总库存' AS machine_id,
  SUM(quantity_on_hand) AS quantity_on_hand,
  CASE
    WHEN SUM(quantity_on_hand) <= 0 THEN 0
    ELSE ROUND(SUM(inventory_value_cents) * 1.0 / SUM(quantity_on_hand))
  END AS avg_cost_cents,
  SUM(inventory_value_cents) AS inventory_value_cents,
  SUM(total_purchase_qty) AS total_purchase_qty,
  SUM(total_purchase_cost_cents) AS total_purchase_cost_cents,
  MAX(updated_at) AS updated_at
FROM inventory_balances
WHERE machine_id != '轨道机'
GROUP BY product_id;

DELETE FROM inventory_balances
WHERE machine_id != '轨道机';

INSERT INTO inventory_balances (
  product_id, machine_id, quantity_on_hand, avg_cost_cents, inventory_value_cents,
  total_purchase_qty, total_purchase_cost_cents, updated_at
)
SELECT
  product_id, machine_id, quantity_on_hand, avg_cost_cents,
  CASE WHEN quantity_on_hand <= 0 THEN 0 ELSE inventory_value_cents END,
  total_purchase_qty, total_purchase_cost_cents,
  COALESCE(updated_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
FROM __shared_inventory_balances;

DROP TABLE __shared_inventory_balances;

UPDATE stock_movements
SET machine_id = '总库存'
WHERE machine_id != '轨道机';

UPDATE purchase_orders
SET machine_id = '总库存',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE machine_id IS NULL
   OR machine_id != '轨道机';
