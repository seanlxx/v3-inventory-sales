import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { aggregateInventory, normalizeProductName } from '../functions/api/_shared/shengma/mapper.js';
import { encryptLoginPassword } from '../functions/api/_shared/shengma/crypto.js';
import { ShengmaClient } from '../functions/api/_shared/shengma/client.js';
import { importShengmaData } from '../functions/api/_shared/shengma/importer.js';
import { parseCosts, parseGoods } from '../functions/api/_shared/shengma/parser.js';

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

  async batch(statements) {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.db.exec('COMMIT;');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK;');
      throw error;
    }
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
    return {
      success: true,
      meta: {
        ...result,
        last_row_id: result.lastInsertRowid ? Number(result.lastInsertRowid) : undefined
      }
    };
  }
}

const env = { DB: new D1Database() };
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0001_initial_d1_schema.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0006_v3_structured_inventory_schema.sql'), 'utf8'));
env.DB.exec(readFileSync(join(projectRoot, 'migrations', '0007_shengma_integration.sql'), 'utf8'));
env.DB.exec(`
  INSERT INTO external_sync_runs (id, integration, started_at, status, dry_run, date_start, date_end)
  VALUES (1, 'shengma', 1, 'success', 0, '2026-05-15', '2026-05-15');
  INSERT INTO external_sync_runs (id, integration, started_at, status, dry_run, date_start, date_end)
  VALUES (2, 'shengma', 2, 'success', 0, '2026-05-15', '2026-05-15');
  INSERT INTO external_sync_runs (id, integration, started_at, status, dry_run, date_start, date_end)
  VALUES (3, 'shengma', 3, 'success', 0, '2026-05-15', '2026-05-15');
  INSERT INTO external_sync_runs (id, integration, started_at, status, dry_run, date_start, date_end)
  VALUES (4, 'shengma', 4, 'success', 0, '2026-05-15', '2026-05-15');
`);

assert.equal(normalizeProductName('可口可乐(330ML)'), '可口可乐330ml');
assert.equal(normalizeProductName('Coca-Cola 330ML'), 'cocacola330ml');
assert.equal(normalizeProductName('娃哈哈纯净水596毫升'), '娃哈哈纯净水596ml');

const encryptedLogin = encryptLoginPassword('12345678');
assert.match(encryptedLogin.password, /^[A-Za-z0-9+/]+=*$/);
assert.match(encryptedLogin.encryptAesKey, /^[A-Za-z0-9+/]+=*$/);

const originalFetch = globalThis.fetch;
let loginFetchCount = 0;
globalThis.fetch = async (url, options) => {
  loginFetchCount += 1;
  assert.equal(url, 'https://example.test/hbshengma/mobile/mobilelogin.html');
  if (loginFetchCount === 1) {
    assert.equal(options.method, 'GET');
    return new Response('<form name="login"><input name="username"></form>', {
      status: 200,
      headers: {
        'set-cookie': 'JSESSIONID=login-page; Path=/; HttpOnly'
      }
    });
  }
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Cookie, 'JSESSIONID=login-page');
  return new Response('', {
    status: 302,
    headers: {
      'set-cookie': 'JSESSIONID=login-ok; Path=/; HttpOnly'
    }
  });
};
try {
  const client = new ShengmaClient({
    DB: env.DB,
    SHENGMA_BASE_URL: 'https://example.test/hbshengma',
    SHENGMA_USERNAME: 'demo',
    SHENGMA_PASSWORD: '12345678'
  });
  await client.login();
  assert.equal(client.cookie, 'JSESSIONID=login-ok');
  assert.equal(loginFetchCount, 2);
} finally {
  globalThis.fetch = originalFetch;
}

const warnings = [];
const goodsCards = parseGoods(`
  <div class="to-rep-list">
    <div class="item" huodao="11">
      <div class="top">
        <div class="huodao"><span class="title">货道</span><span class="value">11</span></div>
        <div class="goods-name"><span class="value">和成天下槟榔干</span></div>
        <div class="price">30.00</div>
      </div>
      <div class="bottom item-huodao">
        <div class="stock item-huodao"><span class="title">库存:</span><span class="value">5</span></div>
      </div>
      <div class="bottom-price item-goods" style="display: none;">
        <div class="new-price"><span class="title">价格:</span><div class="price"><input value="30.00" /></div></div>
      </div>
    </div>
  </div>
`);
assert.deepEqual(goodsCards[0], {
  vendorAisleCode: '11',
  vendorProductName: '和成天下槟榔干',
  qty: 5,
  sellPriceCents: 3000,
  hidden: false,
  raw: ['11', '和成天下槟榔干', '5', '30']
});

const costCards = parseCosts(`
  <div class="huodao-list">
    <div class="item" data-am-scrollspy="{animation: 'slide-bottom'}">
      <div class="top">
        <div class="huodao"><span>货道</span><span class="num">11</span></div>
        <div class="goods">和成天下槟榔干</div>
      </div>
      <div class="bottom">
        <div class="price">30</div>
        <div class="curr-jinjia"><span class="title">当前进价：</span><span class="value">24.41</span></div>
      </div>
    </div>
  </div>
`);
assert.deepEqual(costCards[0], {
  vendorAisleCode: '11',
  vendorProductName: '和成天下槟榔干',
  costCents: 2441,
  raw: ['11', '和成天下槟榔干', '24.41']
});

const inventory = aggregateInventory([
  { vendorAisleCode: 'A1', vendorProductName: '可口可乐 330ml', qty: 2, sellPriceCents: 300 },
  { vendorAisleCode: 'A2', vendorProductName: '可口可乐(330ML)', qty: 3, sellPriceCents: 300 },
  { vendorAisleCode: 'B1', vendorProductName: '测试商品', qty: 9, sellPriceCents: 100 },
  { vendorAisleCode: 'C1', vendorProductName: '占位商品', qty: 1, sellPriceCents: 99900 },
  { vendorAisleCode: 'D1', vendorProductName: '商品6', qty: 5, sellPriceCents: 99990 },
  { vendorAisleCode: 'D2', vendorProductName: '商品101', qty: 1, sellPriceCents: 0 }
], [
  { vendorAisleCode: 'A1', vendorProductName: '可口可乐 330ml', costCents: 180 },
  { vendorAisleCode: 'A2', vendorProductName: '可口可乐(330ML)', costCents: 210 }
], warnings);

assert.equal(inventory.length, 1);
assert.equal(inventory[0].qty, 5);
assert.equal(inventory[0].sellPriceCents, 300);
assert.equal(inventory[0].costCents, 198);
assert.equal(warnings.length, 5);

const firstRun = await importShengmaData(env, 1, {
  startDate: '2026-05-15',
  scope: ['inventory', 'sales'],
  inventoryItems: inventory,
  sales: [{
    vendorOrderNo: 'SM001',
    vendorProductName: '可口可乐330ml',
    quantity: 2,
    amountCents: 600,
    costCents: 198,
    date: '2026-05-15',
    paidShipped: true,
    raw: []
  }],
  warnings: []
});

assert.equal(firstRun.summary.productsCreated, 1);
assert.equal(firstRun.summary.salesImported, 1);
assert.equal(firstRun.summary.inventoryAdjusted, 1);

const secondRun = await importShengmaData(env, 2, {
  startDate: '2026-05-15',
  scope: ['sales'],
  inventoryItems: [],
  sales: [{
    vendorOrderNo: 'SM001',
    vendorProductName: '可口可乐330ml',
    quantity: 2,
    amountCents: 600,
    costCents: 198,
    date: '2026-05-15',
    paidShipped: true,
    raw: []
  }],
  warnings: []
});

assert.equal(secondRun.summary.salesImported, 0);
assert.equal(secondRun.summary.salesDuplicate, 1);
assert.equal(await movementBalanceDiffCount(), 0);

const partialRun = await importShengmaData(env, 3, {
  startDate: '2026-05-15',
  scope: ['sales'],
  inventoryItems: [],
  sales: [
    {
      vendorOrderNo: 'SM002',
      vendorProductName: '可口可乐330ml',
      quantity: 1,
      amountCents: 300,
      costCents: -1,
      date: '2026-05-15',
      paidShipped: true,
      raw: []
    },
    {
      vendorOrderNo: 'SM003',
      vendorProductName: '可口可乐330ml',
      quantity: 1,
      amountCents: 300,
      costCents: 198,
      date: '2026-05-15',
      paidShipped: true,
      raw: []
    }
  ],
  warnings: []
});

assert.equal(partialRun.summary.salesImported, 1);
assert.equal(partialRun.summary.salesSkipped, 1);
assert.equal(partialRun.warnings.some(warning => warning.includes('SM002')), true);
const importedAfterBadSale = await env.DB.prepare(`
  SELECT COUNT(*) AS count
  FROM sales_orders
  WHERE external_id IN ('SM002', 'SM003')
`).first();
assert.equal(Number(importedAfterBadSale.count), 1);
assert.equal(await movementBalanceDiffCount(), 0);

const partialInventoryRun = await importShengmaData(env, 4, {
  startDate: '2026-05-15',
  scope: ['inventory'],
  inventoryItems: [
    {
      vendorProductName: '坏库存项',
      normalizedName: '坏库存项',
      qty: 3,
      sellPriceCents: 100,
      costCents: 50,
      aisles: null
    },
    {
      vendorProductName: '雪碧330ml',
      normalizedName: '雪碧330ml',
      qty: 7,
      sellPriceCents: 300,
      costCents: 150,
      aisles: [{
        vendorAisleCode: 'E1',
        vendorProductName: '雪碧330ml',
        qty: 7,
        sellPriceCents: 300,
        costCents: 150
      }]
    }
  ],
  sales: [],
  warnings: []
});

assert.equal(partialInventoryRun.summary.productsCreated, 1);
assert.equal(partialInventoryRun.summary.inventoryAdjusted, 1);
assert.equal(partialInventoryRun.warnings.some(warning => warning.includes('坏库存项')), true);
const spriteBalance = await env.DB.prepare(`
  SELECT b.quantity_on_hand, b.avg_cost_cents, b.inventory_value_cents
  FROM inventory_balances b
  JOIN products p ON p.id = b.product_id
  WHERE p.machine_id = '三号机' AND p.name = '雪碧330ml'
`).first();
assert.deepEqual({
  quantity_on_hand: spriteBalance.quantity_on_hand,
  avg_cost_cents: spriteBalance.avg_cost_cents,
  inventory_value_cents: spriteBalance.inventory_value_cents
}, {
  quantity_on_hand: 7,
  avg_cost_cents: 150,
  inventory_value_cents: 1050
});
assert.equal(await movementBalanceDiffCount(), 0);

const balance = await env.DB.prepare(`
  SELECT b.quantity_on_hand, b.avg_cost_cents, b.inventory_value_cents
  FROM inventory_balances b
  JOIN products p ON p.id = b.product_id
  WHERE p.machine_id = '三号机' AND p.name = '可口可乐 330ml'
`).first();
assert.deepEqual({
  quantity_on_hand: balance.quantity_on_hand,
  avg_cost_cents: balance.avg_cost_cents,
  inventory_value_cents: balance.inventory_value_cents
}, {
  quantity_on_hand: 4,
  avg_cost_cents: 198,
  inventory_value_cents: 792
});

console.log('shengma integration tests passed');

async function movementBalanceDiffCount() {
  const row = await env.DB.prepare(`
    WITH movement_totals AS (
      SELECT product_id, machine_id, SUM(qty_delta) AS recalculated_qty
      FROM stock_movements
      GROUP BY product_id, machine_id
    )
    SELECT COUNT(*) AS count
    FROM inventory_balances b
    LEFT JOIN movement_totals m
      ON m.product_id = b.product_id
     AND m.machine_id = b.machine_id
    WHERE b.quantity_on_hand != COALESCE(m.recalculated_qty, 0)
  `).first();
  return Number(row.count) || 0;
}
