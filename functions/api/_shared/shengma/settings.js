import { first, run } from '../d1.js';
import { nowIso } from '../validators.js';

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function getSettingValue(db, key) {
  const row = await first(db, `
    SELECT data
    FROM vending_records
    WHERE store = 'settings' AND record_id = ?
    LIMIT 1
  `, [key]);
  if (!row) return null;
  const data = safeJsonParse(row.data || '{}', {});
  return data?.value ?? null;
}

export async function saveSettingValue(db, key, value) {
  const timestamp = nowIso();
  await run(db, `
    INSERT INTO vending_records (
      store, record_id, data, created_at, updated_at
    ) VALUES ('settings', ?, ?, ?, ?)
    ON CONFLICT(store, record_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `, [key, JSON.stringify({ key, value }), timestamp, timestamp]);
}

