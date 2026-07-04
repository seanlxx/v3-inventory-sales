import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPhase1MigrationSql } from './profit-system/migrate-phase1.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const db = new DatabaseSync(':memory:');

db.exec('PRAGMA foreign_keys = ON;');
for (const migration of [
  '0001_initial_d1_schema.sql',
  '0006_v3_structured_inventory_schema.sql',
  '0007_shengma_integration.sql',
  '0008_zn_order_fees.sql',
  '0009_sales_received_amount.sql',
  '0011_money_columns_align.sql',
  '0015_product_manual_cost.sql',
  '0019_parallel_profit_system.sql'
]) {
  db.exec(readFileSync(join(projectRoot, 'migrations', migration), 'utf8'));
}

seed();
db.exec(buildPhase1MigrationSql());
db.exec(buildPhase1MigrationSql());

assert.equal(db.prepare('SELECT COUNT(*) AS count FROM products_global').get().count, 2);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM product_aliases').get().count, 4);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM purchase_records').get().count, 1);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM purchase_record_items').get().count, 1);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sales_records').get().count, 2);
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sales_record_items').get().count, 2);

const cola = db.prepare(`
  SELECT canonical_name, legacy_product_count
  FROM products_global
  WHERE normalized_name = 'cola'
`).get();
assert.equal(cola.legacy_product_count, 3);
assert.equal(cola.canonical_name, 'Cola');

const sale = db.prepare(`
  SELECT gross_amount_cents, refund_amount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents
  FROM sales_records
  WHERE legacy_sales_id = 'so-sale'
`).get();
assert.deepEqual({ ...sale }, {
  gross_amount_cents: 500,
  refund_amount_cents: 0,
  net_revenue_cents: 465,
  total_cogs_cents: 200,
  gross_profit_cents: 265
});

const refund = db.prepare(`
  SELECT gross_amount_cents, refund_amount_cents, net_revenue_cents, total_cogs_cents, gross_profit_cents
  FROM sales_records
  WHERE legacy_sales_id = 'so-refund'
`).get();
assert.deepEqual({ ...refund }, {
  gross_amount_cents: 0,
  refund_amount_cents: 100,
  net_revenue_cents: -100,
  total_cogs_cents: 40,
  gross_profit_cents: -60
});

assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM cost_snapshots WHERE source_type = 'purchase_item'").get().count,
  1
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM cost_snapshots WHERE source_type = 'sale_item'").get().count,
  2
);
assert.equal(
  db.prepare("SELECT COUNT(*) AS count FROM cost_snapshots WHERE source_type = 'manual_cost'").get().count,
  1
);

console.log('profit system phase1 migration tests passed');

function seed() {
  db.prepare(`
    INSERT INTO products (
      id, machine_id, name, category, sell_price_cents, status,
      normalized_name, external_id, manual_cost_cents, created_at, updated_at
    ) VALUES
      ('p1', '1号机', 'Cola', 'drink', 500, 'active', 'cola', 'sku-cola-1', 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      ('p2', '2号机', 'Cola', 'drink', 500, 'active', 'cola', 'sku-cola-2', 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      ('p3', '1号机', 'Old Cola', 'drink', 500, 'archived', 'merged:cola', NULL, 0, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'),
      ('p4', '1号机', 'Water', 'drink', 300, 'active', NULL, 'sku-water', 120, '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')
  `).run();

  db.prepare(`
    INSERT INTO purchase_orders (
      id, machine_id, record_date, source, note, image_asset_id, voided_at, created_at, updated_at
    ) VALUES (
      'po-1', '总库存', '2026-06-01', 'manual', NULL, NULL, NULL,
      '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'
    )
  `).run();

  db.prepare(`
    INSERT INTO purchase_items (
      id, purchase_id, product_id, quantity, unit_cost_cents, total_cost_cents, created_at
    ) VALUES (
      'pi-1', 'po-1', 'p1', 10, 100, 1000, '2026-06-01T00:00:00.000Z'
    )
  `).run();

  db.prepare(`
    INSERT INTO sales_orders (
      id, type, machine_id, record_date, year_month, total_amount_cents, total_cogs_cents,
      platform_fee_cents, service_fee_cents, discount_cents, received_amount_cents,
      refund_amount_cents, note, image_asset_id, voided_at, created_at, updated_at, source, external_id
    ) VALUES
      ('so-sale', 'sale', '1号机', '2026-06-02', '2026-06', 500, 200, 10, 5, 20, 485, 0, NULL, NULL, NULL, '2026-06-02T00:00:00.000Z', '2026-06-02T00:00:00.000Z', 'manual', NULL),
      ('so-refund', 'refund', '1号机', '2026-06-03', '2026-06', 100, 40, 0, 0, 0, 100, 100, NULL, NULL, NULL, '2026-06-03T00:00:00.000Z', '2026-06-03T00:00:00.000Z', 'manual', NULL)
  `).run();

  db.prepare(`
    INSERT INTO sales_items (
      id, sales_order_id, product_id, quantity, unit_price_cents, unit_cost_cents,
      line_amount_cents, line_cogs_cents, created_at
    ) VALUES
      ('si-sale', 'so-sale', 'p1', 1, 500, 200, 500, 200, '2026-06-02T00:00:00.000Z'),
      ('si-refund', 'so-refund', 'p1', 1, 100, 40, 100, 40, '2026-06-03T00:00:00.000Z')
  `).run();
}
