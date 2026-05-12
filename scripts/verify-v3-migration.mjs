import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const options = parseArgs(process.argv.slice(2));
const migrationDir = resolve(projectRoot, options.dir);
const generatedAt = new Date().toISOString();

mkdirSync(migrationDir, { recursive: true });

const v2Products = readJson('v2-products.json');
const v2Purchases = readJson('v2-purchases.json');
const v2Sales = readJson('v2-sales.json');
const v2Images = readJson('v2-images-manifest.json');
const v3Products = readJson('v3-products.json');
const v3PurchaseItems = readJson('v3-purchase-items.json');
const v3SalesOrders = readJson('v3-sales-orders.json');
const v3StockMovements = readJson('v3-stock-movements.json');
const v3InventoryBalances = readJson('v3-inventory-balances.json');
const v3ImageAssets = readJson('v3-image-assets.json');
const reconciliationInput = tryReadJson('v3-reconciliation-input.json');

const v2Stats = summarizeV2();
const v3Stats = summarizeV3();
const movementBalanceDiffs = compareMovementTotalsToBalances(v3StockMovements, v3InventoryBalances);
const stockDiffs = compareV2StockToV3Balances(v2Stats.currentStockByProductMachine, v3Stats.balanceByProductMachine);
const dbStats = options.skipDb ? null : queryDatabaseStats();

const report = buildReport();
const reportPath = join(migrationDir, 'v3-reconciliation-report.md');
writeFileSync(reportPath, report, 'utf8');

console.log(`Wrote reconciliation report to ${relativeMigrationPath(reportPath)}.`);
console.log(`movement_balance_differences: ${movementBalanceDiffs.length}`);
console.log(`v2_current_stock_differences: ${stockDiffs.length}`);
if (dbStats) {
  console.log(`db_products: ${dbStats.counts.products}`);
  console.log(`db_stock_balance_differences: ${dbStats.movement_balance_difference_count}`);
}

function buildReport() {
  const lines = [
    '# V3 Migration Reconciliation Report',
    '',
    `Generated at: ${generatedAt}`,
    '',
    '## Summary',
    '',
    '| Check | V2 | V3 JSON | Status |',
    '| --- | ---: | ---: | --- |',
    summaryRow('Products', v2Stats.products, v3Stats.products),
    summaryRow('Purchase quantity', v2Stats.purchaseTotals.quantity, v3Stats.purchaseTotals.quantity),
    summaryRow('Purchase cost cents', v2Stats.purchaseTotals.total_cost_cents, v3Stats.purchaseTotals.total_cost_cents),
    summaryRow('Image records with R2 key', v2Stats.imagesWithR2Key, v3Stats.imageAssets),
    summaryRow('Movement rows vs sales/purchase items', v3Stats.purchaseItems + v3Stats.salesItems, v3Stats.stockMovements),
    '',
    '## Sales Totals',
    '',
    '| Type | V2 orders | V3 orders | V2 amount cents | V3 amount cents | V2 COGS cents | V3 COGS cents | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |'
  ];

  for (const type of ['sale', 'refund', 'loss']) {
    const v2 = v2Stats.salesByType[type];
    const v3 = v3Stats.salesByType[type];
    const ok = v2.count === v3.count
      && v2.total_amount_cents === v3.total_amount_cents
      && v2.total_cogs_cents === v3.total_cogs_cents;
    lines.push(`| ${type} | ${v2.count} | ${v3.count} | ${v2.total_amount_cents} | ${v3.total_amount_cents} | ${v2.total_cogs_cents} | ${v3.total_cogs_cents} | ${status(ok)} |`);
  }

  lines.push(
    '',
    '## Inventory Checks',
    '',
    `Movement totals vs inventory_balances differences: ${movementBalanceDiffs.length}`,
    '',
    `V2 currentStock vs v3 inventory_balances differences: ${stockDiffs.length}`,
    ''
  );

  if (stockDiffs.length > 0) {
    lines.push('| Product/Machine key | V2 current stock | V3 balance | Difference |', '| --- | ---: | ---: | ---: |');
    for (const diff of stockDiffs.slice(0, 100)) {
      lines.push(`| ${diff.key} | ${diff.v2} | ${diff.v3} | ${diff.diff} |`);
    }
    if (stockDiffs.length > 100) {
      lines.push(`| ... | ... | ... | ${stockDiffs.length - 100} more |`);
    }
    lines.push('');
  }

  if (dbStats) {
    lines.push(
      '## Local D1 Import Check',
      '',
      '| Table | JSON rows | DB rows | Status |',
      '| --- | ---: | ---: | --- |',
      summaryRow('products', v3Stats.products, dbStats.counts.products),
      summaryRow('purchase_items', v3Stats.purchaseItems, dbStats.counts.purchase_items),
      summaryRow('sales_orders', v3Stats.salesOrders, dbStats.counts.sales_orders),
      summaryRow('sales_items', v3Stats.salesItems, dbStats.counts.sales_items),
      summaryRow('stock_movements', v3Stats.stockMovements, dbStats.counts.stock_movements),
      summaryRow('inventory_balances', v3Stats.inventoryBalances, dbStats.counts.inventory_balances),
      summaryRow('image_assets', v3Stats.imageAssets, dbStats.counts.image_assets),
      '',
      `DB movement totals vs balances differences: ${dbStats.movement_balance_difference_count}`,
      ''
    );
  }

  lines.push(
    '## Notes',
    '',
    `Transform warning count: ${reconciliationInput?.warning_count ?? 'unknown'}`,
    `V2 images without R2 key: ${v2Stats.imagesWithoutR2Key}`,
    '',
    'No corrections or adjustment rows were applied by this verification script.',
    ''
  );

  return `${lines.join('\n')}\n`;
}

function summaryRow(label, left, right) {
  return `| ${label} | ${left} | ${right} | ${status(left === right)} |`;
}

function status(ok) {
  return ok ? 'OK' : 'DIFF';
}

function summarizeV2() {
  const productById = new Map();
  const currentStockByProductMachine = new Map();

  for (const row of v2Products) {
    const data = parseData(row);
    const id = stringOrNull(row.record_id) || stringOrNull(data.id);
    const machineId = stringOrNull(row.machine_id) || stringOrNull(data.machineId) || stringOrNull(data.machine_id);
    if (!id || !machineId) continue;
    productById.set(id, { id, machine_id: machineId });
    currentStockByProductMachine.set(balanceKey(id, machineId), integerQuantity(data.currentStock));
  }

  const purchaseTotals = { quantity: 0, total_cost_cents: 0 };
  for (const row of v2Purchases) {
    const data = parseData(row);
    const quantity = integerQuantity(data.quantity);
    if (quantity <= 0) continue;
    const unitCostCents = moneyToCents(data.unitPrice);
    purchaseTotals.quantity += quantity;
    purchaseTotals.total_cost_cents += hasValue(data.totalPrice) ? moneyToCents(data.totalPrice) : quantity * unitCostCents;
  }

  const salesByType = emptySalesTotals();
  for (const row of v2Sales) {
    const data = parseData(row);
    const type = normalizeSalesType(data.type);
    const items = Array.isArray(data.items) ? data.items : [];
    const fallbackAmount = items.reduce((sum, item) => {
      if (type === 'loss') return sum;
      const quantity = Math.abs(integerQuantity(item.quantity));
      const unitPriceCents = moneyToCents(item.sellPrice);
      return sum + positiveMoneyCents(firstDefined(item.itemRevenue, unitPriceCents * quantity / 100));
    }, 0);
    const fallbackCogs = items.reduce((sum, item) => {
      const quantity = Math.abs(integerQuantity(item.quantity));
      const unitCostCents = moneyToCents(item.avgCost);
      return sum + positiveMoneyCents(firstDefined(item.itemCogs, unitCostCents * quantity / 100));
    }, 0);

    salesByType[type].count += 1;
    salesByType[type].total_amount_cents += type === 'loss'
      ? 0
      : (hasValue(data.totalAmount) ? positiveMoneyCents(data.totalAmount) : fallbackAmount);
    salesByType[type].total_cogs_cents += hasValue(data.totalCogs) ? positiveMoneyCents(data.totalCogs) : fallbackCogs;
  }

  return {
    products: v2Products.length,
    purchaseTotals,
    salesByType,
    imagesWithR2Key: v2Images.filter(row => stringOrNull(row.r2_key)).length,
    imagesWithoutR2Key: v2Images.filter(row => !stringOrNull(row.r2_key)).length,
    currentStockByProductMachine
  };
}

function summarizeV3() {
  const purchaseTotals = v3PurchaseItems.reduce((totals, item) => {
    totals.quantity += item.quantity;
    totals.total_cost_cents += item.total_cost_cents;
    return totals;
  }, { quantity: 0, total_cost_cents: 0 });

  const salesByType = emptySalesTotals();
  for (const order of v3SalesOrders) {
    salesByType[order.type].count += 1;
    salesByType[order.type].total_amount_cents += order.total_amount_cents;
    salesByType[order.type].total_cogs_cents += order.total_cogs_cents;
  }

  return {
    products: v3Products.length,
    purchaseItems: v3PurchaseItems.length,
    salesOrders: v3SalesOrders.length,
    salesItems: readJson('v3-sales-items.json').length,
    stockMovements: v3StockMovements.length,
    inventoryBalances: v3InventoryBalances.length,
    imageAssets: v3ImageAssets.length,
    purchaseTotals,
    salesByType,
    balanceByProductMachine: new Map(v3InventoryBalances.map(row => [balanceKey(row.product_id, row.machine_id), row.quantity_on_hand]))
  };
}

function compareMovementTotalsToBalances(movements, balances) {
  const totals = new Map();
  for (const movement of movements) {
    const key = balanceKey(movement.product_id, movement.machine_id);
    totals.set(key, (totals.get(key) || 0) + movement.qty_delta);
  }

  const diffs = [];
  for (const balance of balances) {
    const key = balanceKey(balance.product_id, balance.machine_id);
    const movementQty = totals.get(key) || 0;
    if (movementQty !== balance.quantity_on_hand) {
      diffs.push({
        key,
        movementQty,
        balanceQty: balance.quantity_on_hand,
        diff: balance.quantity_on_hand - movementQty
      });
    }
    totals.delete(key);
  }

  for (const [key, movementQty] of totals) {
    if (movementQty !== 0) {
      diffs.push({ key, movementQty, balanceQty: 0, diff: -movementQty });
    }
  }

  return diffs;
}

function compareV2StockToV3Balances(v2Map, v3Map) {
  const keys = new Set([...v2Map.keys(), ...v3Map.keys()]);
  const diffs = [];
  for (const key of keys) {
    const v2 = v2Map.get(key) || 0;
    const v3 = v3Map.get(key) || 0;
    if (v2 !== v3) {
      diffs.push({ key, v2, v3, diff: v3 - v2 });
    }
  }
  return diffs.sort((a, b) => a.key.localeCompare(b.key));
}

function queryDatabaseStats() {
  const sql = `
    SELECT COUNT(*) AS count FROM products;
    SELECT COUNT(*) AS count FROM purchase_items;
    SELECT COUNT(*) AS count FROM sales_orders;
    SELECT COUNT(*) AS count FROM sales_items;
    SELECT COUNT(*) AS count FROM stock_movements;
    SELECT COUNT(*) AS count FROM inventory_balances;
    SELECT COUNT(*) AS count FROM image_assets;
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
    WHERE b.quantity_on_hand != COALESCE(m.recalculated_qty, 0);
  `;
  const results = executeD1(compactSql(sql));
  return {
    counts: {
      products: firstCount(results[0]),
      purchase_items: firstCount(results[1]),
      sales_orders: firstCount(results[2]),
      sales_items: firstCount(results[3]),
      stock_movements: firstCount(results[4]),
      inventory_balances: firstCount(results[5]),
      image_assets: firstCount(results[6])
    },
    movement_balance_difference_count: firstCount(results[7])
  };
}

function executeD1(sql) {
  const stdout = runWrangler([
    '--yes',
    'wrangler@4.90.1',
    'd1',
    'execute',
    options.database,
    options.remote ? '--remote' : '--local',
    '--command',
    sql,
    '--json'
  ]);
  return parseWranglerJson(stdout);
}

function parseWranglerJson(stdout) {
  const start = stdout.indexOf('[');
  if (start === -1) {
    throw new Error(`Wrangler did not return JSON output: ${stdout.slice(0, 200)}`);
  }
  return JSON.parse(stdout.slice(start));
}

function runWrangler(args) {
  const env = {
    ...process.env,
    npm_config_cache: process.env.npm_config_cache || join(tmpdir(), 'codex-wrangler-npm-cache')
  };
  const command = process.platform === 'win32' ? 'powershell.exe' : 'npx';
  const commandArgs = process.platform === 'win32'
    ? ['-NoProfile', '-NonInteractive', '-Command', ['&', 'npx', ...args.map(quotePowerShellArg)].join(' ')]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    maxBuffer: 200 * 1024 * 1024
  });
  if (result.status !== 0) {
    const details = [result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n');
    throw new Error(`${command} ${commandArgs.join(' ')} failed\n${details}`);
  }
  return result.stdout;
}

function quotePowerShellArg(value) {
  const string = String(value);
  if (/^[a-zA-Z0-9_./\\:@%+=,-]+$/.test(string)) return string;
  return `'${string.replaceAll("'", "''")}'`;
}

function firstCount(result) {
  return Number(result?.results?.[0]?.count || 0);
}

function parseData(row) {
  if (!row?.data) return {};
  if (typeof row.data === 'object') return row.data;
  try {
    return JSON.parse(row.data);
  } catch {
    return {};
  }
}

function readJson(fileName) {
  return JSON.parse(readFileSync(join(migrationDir, fileName), 'utf8'));
}

function tryReadJson(fileName) {
  try {
    return readJson(fileName);
  } catch {
    return null;
  }
}

function moneyToCents(value) {
  if (!hasValue(value)) return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

function positiveMoneyCents(value) {
  return Math.abs(moneyToCents(value));
}

function integerQuantity(value) {
  if (!hasValue(value)) return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number);
}

function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const string = String(value).trim();
  return string ? string : null;
}

function firstDefined(...values) {
  return values.find(hasValue);
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function normalizeSalesType(value) {
  if (value === null || value === undefined || value === '' || value === 'daily') return 'sale';
  if (value === 'sale' || value === 'refund' || value === 'loss') return value;
  return 'sale';
}

function balanceKey(productId, machineId) {
  return `${productId}|${machineId}`;
}

function emptySalesTotals() {
  return {
    sale: { count: 0, total_amount_cents: 0, total_cogs_cents: 0 },
    refund: { count: 0, total_amount_cents: 0, total_cogs_cents: 0 },
    loss: { count: 0, total_amount_cents: 0, total_cogs_cents: 0 }
  };
}

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function relativeMigrationPath(filePath) {
  return filePath.startsWith(projectRoot) ? filePath.slice(projectRoot.length + 1) : filePath;
}

function parseArgs(argv) {
  const parsed = {
    database: 'v3-vending-inventory-sales-db',
    dir: '.migration',
    remote: false,
    skipDb: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--database' || arg === '--db') {
      parsed.database = requireValue(argv, ++index, arg);
    } else if (arg.startsWith('--database=')) {
      parsed.database = arg.slice('--database='.length);
    } else if (arg.startsWith('--db=')) {
      parsed.database = arg.slice('--db='.length);
    } else if (arg === '--dir') {
      parsed.dir = requireValue(argv, ++index, arg);
    } else if (arg.startsWith('--dir=')) {
      parsed.dir = arg.slice('--dir='.length);
    } else if (arg === '--remote') {
      parsed.remote = true;
    } else if (arg === '--local') {
      parsed.remote = false;
    } else if (arg === '--skip-db') {
      parsed.skipDb = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}
