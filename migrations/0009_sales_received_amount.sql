PRAGMA foreign_keys = ON;

ALTER TABLE sales_orders ADD COLUMN received_amount_cents INTEGER NOT NULL DEFAULT 0;

UPDATE sales_orders
SET received_amount_cents = CASE
  WHEN source = 'zn' THEN MAX(total_amount_cents - platform_fee_cents - service_fee_cents, 0)
  ELSE total_amount_cents
END
WHERE received_amount_cents = 0;
