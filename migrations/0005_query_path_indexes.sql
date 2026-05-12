CREATE INDEX IF NOT EXISTS idx_vending_records_store_year_month_updated_at
  ON vending_records (store, year_month, updated_at);

CREATE INDEX IF NOT EXISTS idx_vending_records_store_record_date_updated_at
  ON vending_records (store, record_date, updated_at);

CREATE INDEX IF NOT EXISTS idx_vending_records_store_product_record_date_updated_at
  ON vending_records (store, product_id, record_date, updated_at);
