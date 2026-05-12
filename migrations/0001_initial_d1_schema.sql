PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_auth (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  username TEXT NOT NULL CHECK (length(username) BETWEEN 3 AND 64),
  password_hash TEXT NOT NULL,
  uses_default_password INTEGER NOT NULL DEFAULT 1 CHECK (uses_default_password IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS app_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at
  ON app_sessions (expires_at);

CREATE TABLE IF NOT EXISTS app_login_attempts (
  ip TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_app_login_attempts_ip_attempted_at
  ON app_login_attempts (ip, attempted_at);

CREATE TABLE IF NOT EXISTS vending_records (
  store TEXT NOT NULL CHECK (store IN ('products', 'purchases', 'sales', 'settings')),
  record_id TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  machine_id TEXT,
  product_id TEXT,
  record_date TEXT,
  year_month TEXT,
  name TEXT,
  category TEXT,
  has_image INTEGER NOT NULL DEFAULT 0 CHECK (has_image IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (store, record_id)
);

CREATE INDEX IF NOT EXISTS idx_vending_records_store_updated_at
  ON vending_records (store, updated_at);

CREATE INDEX IF NOT EXISTS idx_vending_records_products_machine_id
  ON vending_records (machine_id)
  WHERE store = 'products';

CREATE INDEX IF NOT EXISTS idx_vending_records_purchases_product_id
  ON vending_records (product_id)
  WHERE store = 'purchases';

CREATE INDEX IF NOT EXISTS idx_vending_records_purchases_record_date
  ON vending_records (record_date)
  WHERE store = 'purchases';

CREATE INDEX IF NOT EXISTS idx_vending_records_sales_year_month
  ON vending_records (year_month)
  WHERE store = 'sales';

CREATE INDEX IF NOT EXISTS idx_vending_records_sales_machine_id
  ON vending_records (machine_id)
  WHERE store = 'sales';

CREATE INDEX IF NOT EXISTS idx_vending_records_sales_record_date
  ON vending_records (record_date)
  WHERE store = 'sales';

CREATE TABLE IF NOT EXISTS vending_record_images (
  store TEXT NOT NULL CHECK (store IN ('purchases', 'sales')),
  record_id TEXT NOT NULL,
  image_base64 TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (store, record_id),
  FOREIGN KEY (store, record_id)
    REFERENCES vending_records (store, record_id)
    ON DELETE CASCADE
);

CREATE VIEW IF NOT EXISTS vending_records_light AS
SELECT
  store,
  record_id,
  data,
  machine_id,
  product_id,
  record_date,
  year_month,
  name,
  category,
  has_image,
  created_at,
  updated_at
FROM vending_records;

CREATE TRIGGER IF NOT EXISTS trg_vending_records_updated_at
AFTER UPDATE ON vending_records
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE vending_records
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE store = NEW.store AND record_id = NEW.record_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_vending_record_images_updated_at
AFTER UPDATE ON vending_record_images
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE vending_record_images
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE store = NEW.store AND record_id = NEW.record_id;
END;

INSERT OR IGNORE INTO app_auth (
  singleton,
  username,
  password_hash,
  uses_default_password
) VALUES (
  1,
  'admin',
  'pbkdf2-sha256$100000$dmVuZGluZy1kMS1kZWZhdWx0LXNhbHQtMjAyNjA1MDU$kyDuylUYrOAl8qCMwVTvUqV46ta9cyUMcVRS5hDWMwo',
  1
);
