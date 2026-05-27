PRAGMA foreign_keys = ON;

-- Phase 2 policy chosen in the 2026-05-27 maintenance window:
-- historical 1/2 purchase stock is assigned to 1号机, then Phase 3 transfer/count
-- will correct physical placement.
UPDATE purchase_orders
SET machine_id = '1号机',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE machine_id IN ('1/2号机', '1/2号机总库存');

UPDATE sales_orders
SET machine_id = '1号机',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE machine_id IN ('1/2号机', '1/2号机总库存');

UPDATE stock_movements
SET machine_id = COALESCE(
  (
    SELECT so.machine_id
    FROM sales_orders so
    WHERE stock_movements.ref_type = 'sales_order'
      AND so.id = stock_movements.ref_id
    LIMIT 1
  ),
  (
    SELECT po.machine_id
    FROM purchase_orders po
    WHERE stock_movements.ref_type = 'purchase_order'
      AND po.id = stock_movements.ref_id
    LIMIT 1
  ),
  '1号机'
)
WHERE machine_id IN ('1/2号机', '1/2号机总库存');

DELETE FROM inventory_balances
WHERE machine_id IN ('1/2号机', '1/2号机总库存');
