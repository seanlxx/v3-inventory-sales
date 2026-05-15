PRAGMA foreign_keys = ON;

ALTER TABLE products ADD COLUMN normalized_name TEXT;
ALTER TABLE products ADD COLUMN external_id TEXT;

ALTER TABLE sales_orders ADD COLUMN external_id TEXT;
ALTER TABLE sales_orders ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE stock_movements ADD COLUMN external_id TEXT;
ALTER TABLE stock_movements ADD COLUMN reason TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_machine_external
  ON products(machine_id, external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_machine_normalized
  ON products(machine_id, normalized_name) WHERE normalized_name IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_source_external
  ON sales_orders(source, external_id) WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_external
  ON stock_movements(external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS external_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  dry_run INTEGER NOT NULL DEFAULT 0 CHECK (dry_run IN (0, 1)),
  date_start TEXT NOT NULL,
  date_end TEXT NOT NULL,
  summary_json TEXT,
  warnings_json TEXT,
  error_message TEXT,
  trigger_source TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started
  ON external_sync_runs(integration, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_runs_one_running
  ON external_sync_runs(integration) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS external_sales_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration TEXT NOT NULL,
  vendor_order_no TEXT NOT NULL,
  local_sales_order_id TEXT NOT NULL,
  imported_at INTEGER NOT NULL,
  raw_json TEXT,
  UNIQUE(integration, vendor_order_no),
  FOREIGN KEY (local_sales_order_id) REFERENCES sales_orders(id)
);

CREATE TABLE IF NOT EXISTS external_product_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration TEXT NOT NULL,
  vendor_product_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  local_product_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(integration, vendor_product_name),
  FOREIGN KEY (local_product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS external_inventory_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL,
  vendor_aisle_code TEXT,
  vendor_product_name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  sell_price_cents INTEGER NOT NULL,
  cost_cents INTEGER,
  snapshotted_at INTEGER NOT NULL,
  FOREIGN KEY (sync_run_id) REFERENCES external_sync_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_inv_snap_run
  ON external_inventory_snapshots(sync_run_id);
