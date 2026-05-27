PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  from_machine_id TEXT NOT NULL,
  to_machine_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  voided_at TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_product
  ON stock_transfers(product_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_machines
  ON stock_transfers(from_machine_id, to_machine_id);
