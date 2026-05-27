import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet } from '../functions/api/reports/dashboard.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);

class D1Database {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(sql) {
    return new D1Statement(this.db, sql);
  }

  exec(sql) {
    this.db.exec(sql);
  }
}

class D1Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new D1Statement(this.db, this.sql, params.map(param => param === undefined ? null : param));
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params) };
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.params) || null;
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: result };
  }
}

const env = { DB: new D1Database() };
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0001_initial_d1_schema.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0006_v3_structured_inventory_schema.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0007_shengma_integration.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0008_zn_order_fees.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0009_sales_received_amount.sql'), 'utf8'));

const testDate = new Date().toISOString().slice(0, 10);
const testMonth = testDate.slice(0, 7);
const testTimestamp = `${testDate}T00:00:00.000Z`;

await seedDashboardRows();

const trendDays = 45;
const response = await onRequestGet({
  request: new Request(`https://example.test/api/reports/dashboard?month=${testMonth}&days=${trendDays}&machineId=machine-a`),
  env
});
const report = await response.json();

assert.equal(report.salesTrend.length, trendDays, 'dashboard trend should honor custom day range');
const trendPoint = report.salesTrend.find(point => point.date === testDate);
assert.ok(trendPoint, 'dashboard trend should include the seeded date');
assert.equal(trendPoint.revenue, 90, 'trend revenue should subtract refunds from sale totals');
assert.equal(trendPoint.quantity, 5, 'trend quantity should sum all order items');

assert.equal(report.machineRanking[0].machineId, 'machine-a');
assert.equal(report.machineRanking[0].revenue, 90, 'ranking revenue should subtract refunds from sale totals');
assert.equal(report.kpis.monthRevenue, 90, 'dashboard month revenue should subtract refunds from sale totals');
assert.equal(report.kpis.monthReceived, 88, 'dashboard should expose net received amount after refunds and fees');
assert.equal(report.kpis.refunds, 30, 'dashboard should still expose refund total separately');
assert.equal(report.kpis.monthGrossProfit, 52, 'dashboard gross profit should use net received amount minus net cogs');
assert.equal(report.machineRanking[0].profit, 52, 'ranking profit should use net received amount minus net cogs');
assert.equal(report.machineRanking[0].quantity, 5, 'ranking quantity should sum all order items');

console.log('dashboard report aggregation tests passed');

async function seedDashboardRows() {
  await env.DB.prepare(`
    INSERT INTO products (
      id, machine_id, name, category, sell_price_cents, status, created_at, updated_at
    ) VALUES
      ('p1', 'machine-a', 'Tea', 'drink', 3000, 'active', ?, ?),
      ('p2', 'machine-a', 'Water', 'drink', 3000, 'active', ?, ?)
  `).bind(testTimestamp, testTimestamp, testTimestamp, testTimestamp).run();

  await env.DB.prepare(`
    INSERT INTO inventory_balances (
      product_id, machine_id, quantity_on_hand, avg_cost_cents, inventory_value_cents,
      total_purchase_qty, total_purchase_cost_cents, updated_at
    ) VALUES
      ('p1', 'machine-a', 10, 900, 9000, 10, 9000, ?),
      ('p2', 'machine-a', 10, 900, 9000, 10, 9000, ?)
  `).bind(testTimestamp, testTimestamp).run();

  await env.DB.prepare(`
    INSERT INTO sales_orders (
      id, type, machine_id, record_date, year_month, total_amount_cents, total_cogs_cents,
      received_amount_cents, note, image_asset_id, voided_at, created_at, updated_at
    ) VALUES (
      'so-multi-item', 'sale', 'machine-a', ?, ?, 12000, 4500, 11800,
      NULL, NULL, NULL, ?, ?
    ), (
      'so-refund', 'refund', 'machine-a', ?, ?, 3000, 900, 3000,
      NULL, NULL, NULL, ?, ?
    )
  `).bind(
    testDate, testMonth, testTimestamp, testTimestamp,
    testDate, testMonth, testTimestamp, testTimestamp
  ).run();

  await env.DB.prepare(`
    INSERT INTO sales_items (
      id, sales_order_id, product_id, quantity, unit_price_cents, unit_cost_cents,
      line_amount_cents, line_cogs_cents, created_at
    ) VALUES
      ('so-multi-item:0', 'so-multi-item', 'p1', 2, 3000, 900, 6000, 1800, ?),
      ('so-multi-item:1', 'so-multi-item', 'p2', 3, 2000, 900, 6000, 2700, ?)
  `).bind(testTimestamp, testTimestamp).run();
}
