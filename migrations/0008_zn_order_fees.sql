PRAGMA foreign_keys = ON;

ALTER TABLE sales_orders ADD COLUMN platform_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN service_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
