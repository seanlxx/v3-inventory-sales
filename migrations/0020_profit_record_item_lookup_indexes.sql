CREATE INDEX IF NOT EXISTS idx_purchase_record_items_record
  ON purchase_record_items(purchase_record_id);

CREATE INDEX IF NOT EXISTS idx_sales_record_items_record
  ON sales_record_items(sales_record_id);
