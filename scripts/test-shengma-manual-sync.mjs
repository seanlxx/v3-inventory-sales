import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { onRequestGet as getStatus } from '../functions/api/integrations/shengma/status.js';
import { onRequestPost as postSync } from '../functions/api/integrations/shengma/sync.js';
import { hasNextSalesPage, parseCosts, parseGoods, parseSales } from '../functions/api/_shared/shengma/parser.js';

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
    return { success: true, meta: { ...result, last_row_id: result.lastInsertRowid } };
  }
}

const env = {
  DB: new D1Database(),
  SHENGMA_BASE_URL: 'https://shengma.test',
  SHENGMA_USERNAME: 'demo',
  SHENGMA_PASSWORD: 'demo-password'
};

for (const migration of [
  '0001_initial_d1_schema.sql',
  '0006_v3_structured_inventory_schema.sql',
  '0007_shengma_integration.sql',
  '0008_zn_order_fees.sql',
  '0009_sales_received_amount.sql',
  '0011_money_columns_align.sql',
  '0019_parallel_profit_system.sql',
  '0020_profit_record_item_lookup_indexes.sql'
]) {
  env.DB.exec(readFileSync(join(projectRoot, 'migrations', migration), 'utf8'));
}

env.DB.exec(`
  INSERT INTO vending_records (store, record_id, data, created_at, updated_at)
  VALUES (
    'settings',
    'shengma.session',
    '{"key":"shengma.session","value":{"cookie":"sid=test","expiresAt":4102444800000}}',
    '2026-07-06T00:00:00.000Z',
    '2026-07-06T00:00:00.000Z'
  );
`);

assert.deepEqual(parseGoods(tableGoodsHtml()).map(item => item.vendorProductName), ['可乐']);
assert.deepEqual(parseGoods(goodsHtml()).map(item => item.vendorProductName), ['可乐']);
assert.deepEqual(parseCosts(tableCostsHtml()).map(item => item.vendorProductName), ['可乐']);
assert.deepEqual(parseCosts(costsHtml()).map(item => item.vendorProductName), ['可乐']);
assert.deepEqual(parseSales(tableSalesHtml()).map(item => item.vendorOrderNo), ['SM001']);
assert.deepEqual(parseSales(salesHtml()).map(item => item.vendorOrderNo), ['SM001']);
assert.equal(parseSales(salesHtml())[0].paidShipped, true);
assert.equal(hasNextSalesPage('<div>共计 <span>41</span> 条</div>', 1), true);
assert.equal(hasNextSalesPage('<div>共计 <span>41</span> 条</div>', 2), false);

const originalFetch = globalThis.fetch;
let loginPageRequests = 0;
let loginPostRequests = 0;
let loginShouldFail = false;
globalThis.fetch = async (url, init = {}) => {
  const href = String(url);
  const method = String(init?.method || 'GET').toUpperCase();
  if (href.includes('/mobile/mobilelogin.html')) {
    if (method === 'GET') {
      loginPageRequests += 1;
      return htmlResponse(loginHtml(), {
        'set-cookie': 'prelogin=ready; Path=/; HttpOnly'
      });
    }

    loginPostRequests += 1;
    const headers = new Headers(init?.headers || {});
    assert.match(headers.get('cookie') || '', /prelogin=ready/);
    return loginRedirectResponse(href, loginShouldFail ? '/mobile/mobilelogin.html' : '/mobile/index.html');
  }
  if (href.includes('/mobile/goods.html')) return htmlResponse(goodsHtml());
  if (href.includes('/mobile/setJinjia.html')) return htmlResponse(costsHtml());
  if (href.includes('/mobile/salesAll.html')) return htmlResponse(salesHtml());
  throw new Error(`Unexpected fetch: ${href}`);
};

try {
  const statusResponse = await getStatus({
    request: new Request('https://example.test/api/integrations/shengma/status'),
    env
  });
  const status = await statusResponse.json();
  assert.equal(status.credentials.configured, true);
  assert.equal(status.mapping.localMachineName, '轨道机');
  assert.equal(status.lastRun, null);

  const previewResponse = await postSync({
    request: jsonRequest('https://example.test/api/integrations/shengma/sync', {
      startDate: '2026-07-06',
      endDate: '2026-07-06',
      dryRun: true,
      scope: ['inventory', 'sales']
    }),
    env
  });
  const preview = await previewResponse.json();
  assert.equal(preview.status, 'success');
  assert.equal(preview.dryRun, true);
  assert.equal(preview.summary.productsCreated, 1);
  assert.equal(preview.summary.salesImported, 1);
  assert.equal(countRows('products_global'), 0);

  const syncResponse = await postSync({
    request: jsonRequest('https://example.test/api/integrations/shengma/sync', {
      startDate: '2026-07-06',
      endDate: '2026-07-06',
      dryRun: false,
      scope: ['inventory', 'sales']
    }),
    env
  });
  const sync = await syncResponse.json();
  assert.equal(sync.status, 'success');
  assert.equal(sync.dryRun, false);
  assert.equal(sync.summary.productsCreated, 1);
  assert.equal(sync.summary.salesImported, 1);
  assert.equal(sync.summary.inventoryAdjusted, 1);

  const product = env.DB.db.prepare('SELECT * FROM products_global').get();
  assert.equal(product.canonical_name, '可乐');
  assert.equal(product.normalized_name, '可乐');
  assert.equal(product.default_sell_price_cents, 500);
  assert.equal(countRows('product_aliases'), 1);

  const sale = env.DB.db.prepare('SELECT * FROM sales_records').get();
  assert.equal(sale.source, 'shengma');
  assert.equal(sale.external_id, 'SM001');
  assert.equal(sale.machine_id, '轨道机');
  assert.equal(sale.gross_amount_cents, 1000);
  assert.equal(sale.total_cogs_cents, 400);
  assert.equal(sale.gross_profit_cents, 600);
  assert.equal(countRows('sales_record_items'), 1);
  assert.equal(countRows('cost_snapshots'), 2);
  assert.equal(countRows('external_inventory_snapshots'), 1);

  const duplicateResponse = await postSync({
    request: jsonRequest('https://example.test/api/integrations/shengma/sync', {
      startDate: '2026-07-06',
      endDate: '2026-07-06',
      dryRun: false,
      scope: ['inventory', 'sales']
    }),
    env
  });
  const duplicate = await duplicateResponse.json();
  assert.equal(duplicate.status, 'success');
  assert.equal(duplicate.summary.salesImported, 0);
  assert.equal(duplicate.summary.salesDuplicate, 1);
  assert.equal(countRows('sales_records'), 1);

  env.DB.exec(`
    UPDATE vending_records
    SET data = '{"key":"shengma.session","value":{"cookie":"sid=expired","expiresAt":0}}'
    WHERE store = 'settings' AND record_id = 'shengma.session'
  `);
  const loginResponse = await postSync({
    request: jsonRequest('https://example.test/api/integrations/shengma/sync', {
      startDate: '2026-07-06',
      endDate: '2026-07-06',
      dryRun: true,
      scope: ['sales']
    }),
    env
  });
  const loginPreview = await loginResponse.json();
  assert.equal(loginPreview.status, 'success');
  assert.equal(loginPageRequests, 1);
  assert.equal(loginPostRequests, 1);

  loginShouldFail = true;
  env.DB.exec(`
    UPDATE vending_records
    SET data = '{"key":"shengma.session","value":{"cookie":"sid=expired","expiresAt":0}}'
    WHERE store = 'settings' AND record_id = 'shengma.session'
  `);
  const failedLoginResponse = await postSync({
    request: jsonRequest('https://example.test/api/integrations/shengma/sync', {
      startDate: '2026-07-06',
      endDate: '2026-07-06',
      dryRun: true,
      scope: ['sales']
    }),
    env
  });
  const failedLogin = await failedLoginResponse.json();
  assert.equal(failedLoginResponse.status, 400);
  assert.match(failedLogin.message, /盛码登录失败/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('shengma manual sync tests passed');

function jsonRequest(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function htmlResponse(html, headers = {}) {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers }
  });
}

function loginRedirectResponse(url, location) {
  return {
    status: 302,
    url,
    headers: new Headers({
      'set-cookie': 'sid=login; Path=/; HttpOnly',
      location
    }),
    text: async () => ''
  };
}

function countRows(table) {
  return env.DB.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}

function loginHtml() {
  return `
    <form action="/mobile/mobilelogin.html">
      <input name="username">
      <input name="encryptAesKey">
    </form>
  `;
}

function tableGoodsHtml() {
  return `
    <table>
      <tr><th>货道编号</th><th>商品名称</th><th>库存</th><th>售价</th></tr>
      <tr><td>货道编号</td><td>A1</td><td>商品名称</td><td>可乐</td><td>库存</td><td>3</td><td>售价</td><td>5.00</td></tr>
    </table>
  `;
}

function goodsHtml() {
  return `
    <div class="item" huodao="A1">
      <div class="top">
        <span class="goods-name">可乐</span>
        <span class="price">¥5.00</span>
      </div>
      <div class="stock">
        <span class="label">库存</span>
        <span class="value">3</span>
      </div>
    </div>
  `;
}

function tableCostsHtml() {
  return `
    <table>
      <tr><th>货道编号</th><th>商品名称</th><th>进价</th></tr>
      <tr><td>货道编号</td><td>A1</td><td>商品名称</td><td>可乐</td><td>进价</td><td>2.00</td></tr>
    </table>
  `;
}

function costsHtml() {
  return `
    <div class="item">
      <div class="huodao"><span class="num">A1</span></div>
      <div class="goods">可乐</div>
      <div class="curr-jinjia">
        <span class="label">当前进价</span>
        <span class="value">2.00</span>
      </div>
    </div>
  `;
}

function tableSalesHtml() {
  return `
    <table>
      <tr><th>订单号</th><th>商品名称</th><th>数量</th><th>实收金额</th><th>进价</th><th>时间</th><th>支付状态</th><th>出货状态</th></tr>
      <tr><td>订单号</td><td>SM001</td><td>商品名称</td><td>可乐</td><td>数量</td><td>2</td><td>实收金额</td><td>10.00</td><td>进价</td><td>2.00</td><td>2026-07-06 10:00:00</td><td>已支付</td><td>已出货</td></tr>
    </table>
  `;
}

function salesHtml() {
  return `
    <div class="list-item">
      <div class="head">
        <span class="goods-name2">可乐</span>
        <span class="price">10.00</span>
        <span>已支付</span>
      </div>
      <div class="body">
        <p>订单号码 SM001</p>
        <p>出货详情 已出货 未退款</p>
        <p>交易时间 2026-07-06 10:00:00</p>
        <p>进价 2.00</p>
      </div>
      <div class="foot">
        <span class="num"><span class="value">2</span></span>
      </div>
    </div>
  `;
}
