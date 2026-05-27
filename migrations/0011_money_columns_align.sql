PRAGMA foreign_keys = ON;

ALTER TABLE sales_orders ADD COLUMN refund_amount_cents INTEGER NOT NULL DEFAULT 0;

UPDATE sales_orders
SET refund_amount_cents = CASE
  WHEN type = 'refund' THEN total_amount_cents
  ELSE 0
END
WHERE refund_amount_cents = 0;

CREATE INDEX IF NOT EXISTS idx_sales_orders_record_type_machine
  ON sales_orders(record_date, type, machine_id);

CREATE TABLE IF NOT EXISTS external_settlement_imports (
  integration TEXT NOT NULL,
  vendor_order_no TEXT NOT NULL,
  local_sales_order_id TEXT,
  imported_at INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  PRIMARY KEY (integration, vendor_order_no),
  FOREIGN KEY (local_sales_order_id) REFERENCES sales_orders(id)
);
