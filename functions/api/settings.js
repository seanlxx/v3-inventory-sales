import { all, first, run } from './_shared/d1.js';
import { json, methodNotAllowed, parseJsonBody } from './_shared/http.js';
import { nowIso, stringOrNull } from './_shared/validators.js';

function parseSetting(row) {
  if (!row) return null;
  const data = JSON.parse(row.data || '{}');
  return { key: row.record_id, value: data.value };
}

export async function onRequestGet(context) {
  const key = new URL(context.request.url).searchParams.get('id');
  if (key) {
    const row = await first(context.env.DB, `
      SELECT record_id, data
      FROM vending_records
      WHERE store = 'settings' AND record_id = ?
      LIMIT 1
    `, [key]);
    return json(200, parseSetting(row));
  }

  const rows = await all(context.env.DB, `
    SELECT record_id, data
    FROM vending_records
    WHERE store = 'settings'
    ORDER BY record_id
  `);
  return json(200, rows.map(parseSetting).filter(Boolean));
}

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  const key = stringOrNull(body?.key);
  if (!key) return json(400, { message: 'Missing setting key' });
  const timestamp = nowIso();
  const value = body.value;
  const data = JSON.stringify({ key, value });
  await run(context.env.DB, `
    INSERT INTO vending_records (
      store, record_id, data, created_at, updated_at
    ) VALUES ('settings', ?, ?, ?, ?)
    ON CONFLICT(store, record_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `, [key, data, timestamp, timestamp]);
  return json(200, { key, value });
}

export async function onRequestPut(context) {
  return await onRequestPost(context);
}

export async function onRequestDelete(context) {
  const id = new URL(context.request.url).searchParams.get('id');
  if (id) {
    await run(context.env.DB, "DELETE FROM vending_records WHERE store = 'settings' AND record_id = ?", [id]);
  } else {
    await run(context.env.DB, "DELETE FROM vending_records WHERE store = 'settings'");
  }
  return json(204, null);
}

export function onRequest() {
  return methodNotAllowed();
}
