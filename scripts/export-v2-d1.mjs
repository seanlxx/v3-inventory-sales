import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);

const options = parseArgs(process.argv.slice(2));
const outputDir = resolve(projectRoot, options.dir);

if (/v3/i.test(options.database)) {
  throw new Error(`Refusing to export v2 data from a v3 database name: ${options.database}`);
}

mkdirSync(outputDir, { recursive: true });

const recordColumns = [
  'store',
  'record_id',
  'data',
  'machine_id',
  'product_id',
  'record_date',
  'year_month',
  'name',
  'category',
  'has_image',
  'created_at',
  'updated_at'
].join(', ');

const stores = [
  ['products', 'v2-products.json'],
  ['purchases', 'v2-purchases.json'],
  ['sales', 'v2-sales.json'],
  ['settings', 'v2-settings.json']
];

const counts = {};

for (const [store, fileName] of stores) {
  const rows = executeSelect(`
    SELECT ${recordColumns}
    FROM vending_records
    WHERE store = '${store}'
    ORDER BY record_date, created_at, record_id
  `);
  writeJson(join(outputDir, fileName), rows);
  counts[store] = rows.length;
}

const imageRows = executeSelect(`
  SELECT
    i.store,
    i.record_id,
    i.mime_type,
    i.r2_key,
    CASE
      WHEN i.image_base64 IS NULL OR i.image_base64 = '' THEN 0
      ELSE length(i.image_base64)
    END AS image_base64_length,
    (
      SELECT COUNT(*)
      FROM vending_record_image_chunks c
      WHERE c.store = i.store
        AND c.record_id = i.record_id
    ) AS chunk_count,
    i.created_at,
    i.updated_at
  FROM vending_record_images i
  ORDER BY i.store, i.record_id
`);

writeJson(join(outputDir, 'v2-images-manifest.json'), imageRows);
counts.images = imageRows.length;

console.log(`Exported v2 D1 metadata from ${options.database} (${options.remote ? 'remote' : 'local'}) into ${relativeOutputDir(outputDir)}.`);
for (const [name, count] of Object.entries(counts)) {
  console.log(`${name}: ${count}`);
}

function executeSelect(sql) {
  const args = [
    '--yes',
    'wrangler@4.90.1',
    'd1',
    'execute',
    options.database,
    options.remote ? '--remote' : '--local',
    '--command',
    compactSql(sql),
    '--json'
  ];
  const stdout = runNpx(args);
  const parsed = parseWranglerJson(stdout);
  const first = parsed[0];
  if (!first?.success) {
    throw new Error(`D1 query failed for ${options.database}`);
  }
  return first.results ?? [];
}

function parseWranglerJson(stdout) {
  const start = stdout.indexOf('[');
  if (start === -1) {
    throw new Error(`Wrangler did not return JSON output: ${stdout.slice(0, 200)}`);
  }
  return JSON.parse(stdout.slice(start));
}

function runNpx(args) {
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

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function compactSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function relativeOutputDir(dirPath) {
  return dirPath.startsWith(projectRoot) ? dirPath.slice(projectRoot.length + 1) : dirPath;
}

function parseArgs(argv) {
  const parsed = {
    database: 'vending-inventory-sales-db',
    dir: '.migration',
    remote: true
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
    } else if (arg === '--local') {
      parsed.remote = false;
    } else if (arg === '--remote') {
      parsed.remote = true;
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
