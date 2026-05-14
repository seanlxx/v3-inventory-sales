import { all, first, run } from './_shared/d1.js';
import { json, methodNotAllowed, parseJsonBody } from './_shared/http.js';
import { nowIso, stringOrNull } from './_shared/validators.js';

const SECRET_MASK = '********';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function safeParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function maskSecret(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return text.length <= 4 ? SECRET_MASK : `${SECRET_MASK}${text.slice(-4)}`;
}

function sanitizeAiClientConfigs(value) {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([platform, config]) => {
    if (!isObject(config)) return [platform, { configured: false, apiKeyMasked: '', baseUrl: '' }];
    return [platform, {
      configured: !!String(config.apiKey || '').trim(),
      apiKeyMasked: maskSecret(config.apiKey),
      baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : '',
      modelId: typeof config.modelId === 'string' ? config.modelId : ''
    }];
  }));
}

function sanitizeSetting(key, value) {
  if (key === 'aiClientConfigs') return sanitizeAiClientConfigs(value);
  return value;
}

async function getRawSetting(db, key) {
  const row = await first(db, `
    SELECT record_id, data
    FROM vending_records
    WHERE store = 'settings' AND record_id = ?
    LIMIT 1
  `, [key]);
  if (!row) return null;
  const data = safeParse(row.data || '{}', {});
  return { key: row.record_id, value: data.value };
}

async function resolveAiClientConfigsValue(db, nextValue) {
  const incoming = isObject(nextValue) ? nextValue : {};
  const existing = await getRawSetting(db, 'aiClientConfigs');
  const existingValue = isObject(existing?.value) ? existing.value : {};
  const merged = {};

  for (const [platform, config] of Object.entries(incoming)) {
    if (!isObject(config)) continue;
    const current = isObject(existingValue[platform]) ? existingValue[platform] : {};
    const hasApiKey = typeof config.apiKey === 'string' && config.apiKey.trim();
    const hasMaskedApiKey = typeof config.apiKeyMasked === 'string' && config.apiKeyMasked.startsWith(SECRET_MASK);
    const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim() : '';
    const modelId = typeof config.modelId === 'string' ? config.modelId.trim() : '';
    const apiKey = hasApiKey
      ? config.apiKey.trim()
      : hasMaskedApiKey
        ? String(current.apiKey || '').trim()
        : '';

    if (!apiKey && !baseUrl && !modelId) continue;
    merged[platform] = {
      apiKey,
      baseUrl: baseUrl || String(current.baseUrl || '').trim(),
      modelId
    };
  }

  return merged;
}

function parseSetting(row) {
  if (!row) return null;
  const data = JSON.parse(row.data || '{}');
  return { key: row.record_id, value: sanitizeSetting(row.record_id, data.value) };
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
  const value = key === 'aiClientConfigs'
    ? await resolveAiClientConfigsValue(context.env.DB, body.value)
    : body.value;
  const data = JSON.stringify({ key, value });
  await run(context.env.DB, `
    INSERT INTO vending_records (
      store, record_id, data, created_at, updated_at
    ) VALUES ('settings', ?, ?, ?, ?)
    ON CONFLICT(store, record_id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `, [key, data, timestamp, timestamp]);
  return json(200, { key, value: sanitizeSetting(key, value) });
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
