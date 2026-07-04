PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products_global (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  category TEXT,
  default_sell_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (default_sell_price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  legacy_product_count INTEGER NOT NULL DEFAULT 0 CHECK (legacy_product_count >= 0),
  source_product_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_product_ids_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS product_aliases (
  id TEXT PRIMARY KEY,
  product_global_id TEXT NOT NULL,
  alias_name TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'legacy-products',
  source_product_id TEXT,
  source_external_id TEXT,
  source_machine_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (product_global_id) REFERENCES products_global(id)
);

CREATE TABLE IF NOT EXISTS purchase_records (
  id TEXT PRIMARY KEY,
  legacy_purchase_id TEXT UNIQUE,
  record_date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  image_asset_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  voided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (image_asset_id) REFERENCES image_assets(id)
);

CREATE TABLE IF NOT EXISTS purchase_record_items (
  id TEXT PRIMARY KEY,
  purchase_record_id TEXT NOT NULL,
  product_global_id TEXT NOT NULL,
  legacy_purchase_item_id TEXT UNIQUE,
  legacy_product_id TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  total_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cost_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (purchase_record_id) REFERENCES purchase_records(id),
  FOREIGN KEY (product_global_id) REFERENCES products_global(id)
);

CREATE TABLE IF NOT EXISTS sales_records (
  id TEXT PRIMARY KEY,
  legacy_sales_id TEXT UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('sale', 'refund', 'loss')),
  machine_id TEXT NOT NULL,
  record_date TEXT NOT NULL,
  year_month TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT,
  gross_amount_cents INTEGER NOT NULL DEFAULT 0,
  refund_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (refund_amount_cents >= 0),
  platform_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  service_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (service_fee_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  net_revenue_cents INTEGER NOT NULL DEFAULT 0,
  total_cogs_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cogs_cents >= 0),
  gross_profit_cents INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  image_asset_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'voided')),
  voided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (image_asset_id) REFERENCES image_assets(id)
);

CREATE TABLE IF NOT EXISTS sales_record_items (
  id TEXT PRIMARY KEY,
  sales_record_id TEXT NOT NULL,
  product_global_id TEXT NOT NULL,
  legacy_sales_item_id TEXT UNIQUE,
  legacy_product_id TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_cents >= 0),
  line_amount_cents INTEGER NOT NULL DEFAULT 0,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  line_cogs_cents INTEGER NOT NULL DEFAULT 0 CHECK (line_cogs_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (sales_record_id) REFERENCES sales_records(id),
  FOREIGN KEY (product_global_id) REFERENCES products_global(id)
);

CREATE TABLE IF NOT EXISTS cost_snapshots (
  id TEXT PRIMARY KEY,
  product_global_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('purchase_item', 'sale_item', 'manual_cost')),
  source_record_id TEXT,
  source_item_id TEXT,
  legacy_product_id TEXT,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  quantity_context INTEGER,
  total_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cost_cents >= 0),
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (product_global_id) REFERENCES products_global(id)
);

CREATE INDEX IF NOT EXISTS idx_product_aliases_global
  ON product_aliases(product_global_id);

CREATE INDEX IF NOT EXISTS idx_product_aliases_normalized
  ON product_aliases(normalized_alias);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_aliases_source_product
  ON product_aliases(source, source_product_id)
  WHERE source_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_records_date
  ON purchase_records(record_date DESC, status);

CREATE INDEX IF NOT EXISTS idx_purchase_record_items_global
  ON purchase_record_items(product_global_id, purchase_record_id);

CREATE INDEX IF NOT EXISTS idx_sales_records_month_machine
  ON sales_records(year_month, machine_id, record_date DESC, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_records_source_external
  ON sales_records(source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_record_items_global
  ON sales_record_items(product_global_id, sales_record_id);

CREATE INDEX IF NOT EXISTS idx_cost_snapshots_global_effective
  ON cost_snapshots(product_global_id, effective_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_snapshots_source_item
  ON cost_snapshots(source_type, source_item_id)
  WHERE source_item_id IS NOT NULL;
