PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS stock_movements_new (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN ('purchase', 'sale', 'refund', 'loss', 'adjustment', 'void', 'transfer_out', 'transfer_in')
  ),
  qty_delta INTEGER NOT NULL CHECK (qty_delta != 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  ref_item_id TEXT,
  voids_movement_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  external_id TEXT,
  reason TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (voids_movement_id) REFERENCES stock_movements_new(id)
);

INSERT INTO stock_movements_new (
  id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
  ref_type, ref_id, ref_item_id, voids_movement_id, created_at, external_id, reason
)
SELECT
  id, product_id, machine_id, movement_type, qty_delta, unit_cost_cents,
  ref_type, ref_id, ref_item_id, voids_movement_id, created_at, external_id, reason
FROM stock_movements;

DROP TABLE stock_movements;
ALTER TABLE stock_movements_new RENAME TO stock_movements;

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_time
  ON stock_movements(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_ref
  ON stock_movements(ref_type, ref_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_voids
  ON stock_movements(voids_movement_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_external_id
  ON stock_movements(external_id) WHERE external_id IS NOT NULL;

PRAGMA foreign_keys = ON;
