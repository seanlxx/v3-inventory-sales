import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const options = parseArgs(process.argv.slice(2));
const migrationDir = resolve(projectRoot, options.dir);

assertV3Database(options.database);

const tables = [
  {
    table: 'products',
    file: 'v3-products.json',
    columns: ['id', 'machine_id', 'name', 'category', 'sell_price_cents', 'status', 'created_at', 'updated_at']
  },
  {
    table: 'image_assets',
    file: 'v3-image-assets.json',
    columns: ['id', 'r2_key', 'mime_type', 'size_bytes', 'source_store', 'source_record_id', 'created_at']
  },
  {
    table: 'purchase_orders',
    file: 'v3-purchase-orders.json',
    columns: ['id', 'machine_id', 'record_date', 'source', 'note', 'image_asset_id', 'voided_at', 'created_at', 'updated_at']
  },
  {
    table: 'purchase_items',
    file: 'v3-purchase-items.json',
    columns: ['id', 'purchase_id', 'product_id', 'quantity', 'unit_cost_cents', 'total_cost_cents', 'created_at']
  },
  {
    table: 'sales_orders',
    file: 'v3-sales-orders.json',
    columns: ['id', 'type', 'machine_id', 'record_date', 'year_month', 'total_amount_cents', 'total_cogs_cents', 'note', 'image_asset_id', 'voided_at', 'created_at', 'updated_at']
  },
  {
    table: 'sales_items',
    file: 'v3-sales-items.json',
    columns: ['id', 'sales_order_id', 'product_id', 'quantity', 'unit_price_cents', 'unit_cost_cents', 'line_amount_cents', 'line_cogs_cents', 'created_at']
  },
  {
    table: 'stock_movements',
    file: 'v3-stock-movements.json',
    columns: ['id', 'product_id', 'machine_id', 'movement_type', 'qty_delta', 'unit_cost_cents', 'ref_type', 'ref_id', 'ref_item_id', 'voids_movement_id', 'created_at']
  },
  {
    table: 'inventory_balances',
    file: 'v3-inventory-balances.json',
    columns: ['product_id', 'machine_id', 'quantity_on_hand', 'avg_cost_cents', 'inventory_value_cents', 'total_purchase_qty', 'total_purchase_cost_cents', 'updated_at']
  }
];

const data = Object.fromEntries(tables.map(table => [table.table, readRows(table.file)]));
validateRows(data);

console.log(`Prepared v3 import for ${options.database} (${options.remote ? 'remote' : 'local'}).`);
for (const table of tables) {
  console.log(`${table.table}: ${data[table.table].length}`);
}

if (!options.apply) {
  console.log('Dry run only. Re-run with --apply to write rows.');
  process.exit(0);
}

if (options.remote && !options.confirmRemote) {
  throw new Error('Remote imports require --confirm-remote in addition to --remote --apply.');
}

mkdirSync(migrationDir, { recursive: true });
const importSqlPath = join(migrationDir, 'v3-import.sql');
writeFileSync(importSqlPath, buildImportSql(data), 'utf8');

runWrangler([
  '--yes',
  'wrangler@4.90.1',
  'd1',
  'execute',
  options.database,
  options.remote ? '--remote' : '--local',
  '--file',
  importSqlPath,
  '--yes'
]);

console.log(`Imported v3 rows into ${options.database} (${options.remote ? 'remote' : 'local'}).`);

function buildImportSql(rowsByTable) {
  const statements = [
    'PRAGMA foreign_keys = ON;',
    'BEGIN TRANSACTION;'
  ];

  if (options.reset) {
    statements.push(
      'DELETE FROM inventory_balances;',
      'DELETE FROM stock_movements;',
      'DELETE FROM sales_items;',
      'DELETE FROM sales_orders;',
      'DELETE FROM purchase_items;',
      'DELETE FROM purchase_orders;',
      'DELETE FROM image_assets;',
      'DELETE FROM products;'
    );
  }

  for (const spec of tables) {
    const columnsSql = spec.columns.map(column => `"${column}"`).join(', ');
    for (const row of rowsByTable[spec.table]) {
      const valuesSql = spec.columns.map(column => sqlValue(row[column])).join(', ');
      statements.push(`INSERT OR REPLACE INTO ${spec.table} (${columnsSql}) VALUES (${valuesSql});`);
    }
  }

  statements.push('COMMIT;');
  return `${statements.join('\n')}\n`;
}

function validateRows(rowsByTable) {
  const products = new Set(rowsByTable.products.map(row => row.id));
  const imageAssets = new Set(rowsByTable.image_assets.map(row => row.id));
  const purchaseOrders = new Set(rowsByTable.purchase_orders.map(row => row.id));
  const salesOrders = new Set(rowsByTable.sales_orders.map(row => row.id));
  const stockMovements = new Set(rowsByTable.stock_movements.map(row => row.id));

  for (const row of rowsByTable.purchase_orders) {
    if (row.image_asset_id && !imageAssets.has(row.image_asset_id)) {
      throw new Error(`purchase_orders has missing image_asset_id reference: ${row.id}`);
    }
  }
  for (const row of rowsByTable.sales_orders) {
    if (row.image_asset_id && !imageAssets.has(row.image_asset_id)) {
      throw new Error(`sales_orders has missing image_asset_id reference: ${row.id}`);
    }
  }
  for (const row of rowsByTable.purchase_items) {
    if (!purchaseOrders.has(row.purchase_id)) throw new Error(`purchase_items has missing purchase_id reference: ${row.id}`);
    if (!products.has(row.product_id)) throw new Error(`purchase_items has missing product_id reference: ${row.id}`);
  }
  for (const row of rowsByTable.sales_items) {
    if (!salesOrders.has(row.sales_order_id)) throw new Error(`sales_items has missing sales_order_id reference: ${row.id}`);
    if (!products.has(row.product_id)) throw new Error(`sales_items has missing product_id reference: ${row.id}`);
  }
  for (const row of rowsByTable.stock_movements) {
    if (!products.has(row.product_id)) throw new Error(`stock_movements has missing product_id reference: ${row.id}`);
    if (row.voids_movement_id && !stockMovements.has(row.voids_movement_id)) {
      throw new Error(`stock_movements has missing voids_movement_id reference: ${row.id}`);
    }
  }
  for (const row of rowsByTable.inventory_balances) {
    if (!products.has(row.product_id)) throw new Error(`inventory_balances has missing product_id reference: ${row.product_id}`);
  }
}

function readRows(fileName) {
  const filePath = join(migrationDir, fileName);
  const rows = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!Array.isArray(rows)) {
    throw new Error(`${fileName} must contain a JSON array.`);
  }
  return rows;
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assertV3Database(database) {
  const v2Names = new Set([
    'vending-inventory-sales-db',
    'vending-inventory-sales-v2-db'
  ]);
  if (v2Names.has(database) || !/^v3-/i.test(database)) {
    throw new Error(`Refusing to import into non-v3 database: ${database}`);
  }
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
}

function quotePowerShellArg(value) {
  const string = String(value);
  if (/^[a-zA-Z0-9_./\\:@%+=,-]+$/.test(string)) return string;
  return `'${string.replaceAll("'", "''")}'`;
}

function parseArgs(argv) {
  const parsed = {
    database: 'v3-vending-inventory-sales-db',
    dir: '.migration',
    apply: false,
    reset: false,
    remote: false,
    confirmRemote: false
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
    } else if (arg === '--apply') {
      parsed.apply = true;
    } else if (arg === '--dry-run') {
      parsed.apply = false;
    } else if (arg === '--reset') {
      parsed.reset = true;
    } else if (arg === '--remote') {
      parsed.remote = true;
    } else if (arg === '--local') {
      parsed.remote = false;
    } else if (arg === '--confirm-remote') {
      parsed.confirmRemote = true;
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
