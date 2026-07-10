const MAX_TREND_DAYS = 90;
const DEFAULT_TREND_DAYS = 30;
const DEFAULT_LIMIT = 50;
export const PROFIT_MAX_LIMIT = 200;
const MACHINE_ALIASES = new Map([
  ['三号机', '轨道机']
]);

export function normalizeMonth(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 7);
}

export function normalizeDays(value) {
  const days = Math.round(Number(value) || DEFAULT_TREND_DAYS);
  return Math.min(Math.max(days, 1), MAX_TREND_DAYS);
}

export function normalizeLimit(value) {
  const limit = Math.round(Number(value) || DEFAULT_LIMIT);
  return Math.min(Math.max(limit, 1), PROFIT_MAX_LIMIT);
}

export function normalizeMachineId(value) {
  const text = String(value || '').trim();
  if (!text || text === 'all') return '';
  return MACHINE_ALIASES.get(text) || text;
}
