import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const scriptDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = dirname(dirname(scriptDir));
export const outputDir = join(projectRoot, 'output', 'diagnose');

export function ensureOutputDir() {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
}

export function todayStamp() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now).replaceAll('-', '');
}

export function parseWranglerJson(output) {
  const text = String(output || '');
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) {
    throw new Error(`bad wrangler output: ${text.slice(0, 800)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function runD1Query(sql) {
  ensureOutputDir();
  const file = join(outputDir, `_q-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`);
  writeFileSync(file, String(sql).replace(/\s+/g, ' ').trim());
  const escaped = file.replace(/'/g, "''");
  const appData = process.env.APPDATA || '';
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || (appData ? `${appData}/xdg.config` : undefined)
  };
  try {
    const raw = execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `$sql = Get-Content -LiteralPath '${escaped}' -Raw; & npx.cmd wrangler d1 execute v3-vending-inventory-sales-db --remote --json --command $sql`
    ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 80, env });
    return parseWranglerJson(raw).flatMap(item => item.results || []);
  } finally {
    try {
      rmSync(file, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }
}

export function writeJson(name, payload) {
  ensureOutputDir();
  const file = join(outputDir, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

export function readJson(name) {
  return JSON.parse(readFileSync(join(outputDir, `${name}.json`), 'utf8'));
}

export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function absDescBy(field) {
  return (a, b) => Math.abs(toNumber(b[field])) - Math.abs(toNumber(a[field]));
}

export function formatMoney(cents) {
  return (toNumber(cents) / 100).toFixed(2);
}

export function productLabel(row) {
  return row.product_name || row.name || row.product_id || '-';
}

export function createResult({ check, rootCause, rows, summary }) {
  return {
    check,
    root_cause: rootCause,
    generated_at: new Date().toISOString(),
    summary,
    rows
  };
}
