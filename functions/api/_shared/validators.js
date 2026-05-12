export function nowIso() {
  return new Date().toISOString();
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function moneyToCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100);
}

export function centsToMoney(value) {
  return Math.round((Number(value) || 0)) / 100;
}

export function quantity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number);
}

export function positiveQuantity(value) {
  return Math.abs(quantity(value));
}

export function stringOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export function recordDate(value) {
  const text = stringOrNull(value);
  return text ? text.slice(0, 10) : todayDate();
}

export function yearMonthFromDate(value) {
  return recordDate(value).slice(0, 7);
}

export function normalizeSalesType(value) {
  if (value === 'refund') return 'refund';
  if (value === 'loss') return 'loss';
  return 'sale';
}

export function legacySalesType(value) {
  return value === 'sale' ? 'daily' : value;
}

export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}
