import { execFileSync, execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const scriptDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = dirname(dirname(scriptDir));
export const outputDir = join(projectRoot, 'output', 'profit-system');
export const databaseName = 'v3-vending-inventory-sales-db';

export function ensureOutputDir() {
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
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

export function wranglerCommand() {
  for (const file of [
    join(projectRoot, 'node_modules', '.bin', 'wrangler.cmd'),
    join(projectRoot, 'frontend', 'node_modules', '.bin', 'wrangler.cmd')
  ]) {
    if (existsSync(file)) return { command: file, prefix: [] };
  }
  const npx = findOnPath('npx.cmd');
  if (npx) return { command: npx, prefix: ['wrangler'] };
  const pnpm = findOnPath('pnpm.cmd');
  if (pnpm) return { command: pnpm, prefix: ['dlx', 'wrangler'] };
  return { command: 'npx.cmd', prefix: ['wrangler'] };
}

function findOnPath(command) {
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    const file = join(dir, command);
    if (existsSync(file)) return file;
  }
  return null;
}

export function wranglerArgs({ local = false, json = false, command, file } = {}) {
  const args = ['d1', 'execute', databaseName];
  if (local) args.push('--local');
  else args.push('--remote');
  if (json) args.push('--json');
  if (command) args.push('--command', command);
  if (file) args.push('--file', file);
  return args;
}

export function wranglerEnv() {
  const appData = process.env.APPDATA || '';
  return {
    ...process.env,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || (appData ? `${appData}/xdg.config` : undefined)
  };
}

export function runD1Query(sql, options = {}) {
  const command = String(sql).replace(/\s+/g, ' ').trim();
  const wrangler = wranglerCommand();
  const raw = execWrangler(wrangler.command, [...wrangler.prefix, ...wranglerArgs({
    ...options,
    json: true,
    command
  })], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 80,
    env: wranglerEnv()
  });
  return parseWranglerJson(raw).flatMap(item => item.results || []);
}

export function runD1File(sql, options = {}) {
  ensureOutputDir();
  const file = join(outputDir, `_exec-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`);
  writeFileSync(file, `${String(sql).trim()}\n`);
  try {
    const wrangler = wranglerCommand();
    return execWrangler(wrangler.command, [...wrangler.prefix, ...wranglerArgs({
      ...options,
      file
    })], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 80,
      env: wranglerEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } finally {
    rmSync(file, { force: true });
  }
}

function execWrangler(command, args, options) {
  if (!isCmdShim(command)) return execFileSync(command, args, options);
  const commandLine = [command, ...args].map(cmdQuote).join(' ');
  return execSync(commandLine, options);
}

function isCmdShim(command) {
  const lower = command.toLowerCase();
  return lower.endsWith('.cmd') || lower.endsWith('.bat');
}

function cmdQuote(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function formatMoney(cents) {
  return (toNumber(cents) / 100).toFixed(2);
}

export function previousMonth(date = new Date()) {
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  monthStart.setUTCMonth(monthStart.getUTCMonth() - 1);
  return monthStart.toISOString().slice(0, 7);
}
