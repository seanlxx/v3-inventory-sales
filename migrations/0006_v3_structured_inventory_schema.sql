PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  sell_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (sell_price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS image_assets (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes INTEGER,
  source_store TEXT,
  source_record_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  machine_id TEXT,
  record_date TEXT NOT NULL,
  source TEXT,
  note TEXT,
  image_asset_id TEXT,
  voided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (image_asset_id) REFERENCES image_assets(id)
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  total_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cost_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (purchase_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('sale', 'refund', 'loss')),
  machine_id TEXT NOT NULL,
  record_date TEXT NOT NULL,
  year_month TEXT NOT NULL,
  total_amount_cents INTEGER NOT NULL DEFAULT 0,
  total_cogs_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  image_asset_id TEXT,
  voided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (image_asset_id) REFERENCES image_assets(id)
);

CREATE TABLE IF NOT EXISTS sales_items (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  line_amount_cents INTEGER NOT NULL DEFAULT 0,
  line_cogs_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (
    movement_type IN ('purchase', 'sale', 'refund', 'loss', 'adjustment', 'void')
  ),
  qty_delta INTEGER NOT NULL CHECK (qty_delta != 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  ref_item_id TEXT,
  voids_movement_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (voids_movement_id) REFERENCES stock_movements(id)
);

CREATE TABLE IF NOT EXISTS inventory_balances (
  product_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  avg_cost_cents INTEGER NOT NULL DEFAULT 0,
  inventory_value_cents INTEGER NOT NULL DEFAULT 0,
  total_purchase_qty INTEGER NOT NULL DEFAULT 0,
  total_purchase_cost_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (product_id, machine_id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_products_machine_status
  ON products(machine_id, status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_date
  ON purchase_orders(record_date DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_items_product
  ON purchase_items(product_id, purchase_id);

CREATE INDEX IF NOT EXISTS idx_sales_orders_month_machine
  ON sales_orders(year_month, machine_id, record_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_items_product
  ON sales_items(product_id, sales_order_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_time
  ON stock_movements(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_ref
  ON stock_movements(ref_type, ref_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_voids
  ON stock_movements(voids_movement_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_machine_stock
  ON inventory_balances(machine_id, quantity_on_hand);

CREATE INDEX IF NOT EXISTS idx_image_assets_source
  ON image_assets(source_store, source_record_id);
