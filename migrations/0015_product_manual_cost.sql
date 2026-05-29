PRAGMA foreign_keys = ON;

ALTER TABLE products ADD COLUMN manual_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (manual_cost_cents >= 0);
