import { first } from './d1.js';
import { nowIso } from './validators.js';

function base64ToBytes(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function imageR2Key(storeName, recordId) {
  return `${storeName}/${encodeURIComponent(recordId)}`;
}

export async function putImageAsset(env, storeName, recordId, imageBase64, mimeType = 'image/jpeg') {
  if (!imageBase64) return null;

  const id = `${storeName}:${recordId}`;
  const r2Key = imageR2Key(storeName, recordId);
  const bytes = base64ToBytes(imageBase64);

  if (env.IMAGES) {
    await env.IMAGES.put(r2Key, bytes, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { store: storeName, record_id: recordId }
    });
  }

  return {
    id,
    r2_key: r2Key,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
    source_store: storeName,
    source_record_id: recordId,
    created_at: nowIso()
  };
}

export function upsertImageAssetStatement(db, asset) {
  return db.prepare(`
    INSERT INTO image_assets (
      id, r2_key, mime_type, size_bytes, source_store, source_record_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      r2_key = excluded.r2_key,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      source_store = excluded.source_store,
      source_record_id = excluded.source_record_id
  `).bind(
    asset.id,
    asset.r2_key,
    asset.mime_type,
    asset.size_bytes,
    asset.source_store,
    asset.source_record_id,
    asset.created_at
  );
}

export async function readImageBase64(env, assetId) {
  if (!assetId) return null;
  const asset = await first(env.DB, 'SELECT * FROM image_assets WHERE id = ? LIMIT 1', [assetId]);
  if (!asset || !env.IMAGES) return null;

  const object = await env.IMAGES.get(asset.r2_key);
  if (!object) return null;

  return {
    imageBase64: bytesToBase64(new Uint8Array(await object.arrayBuffer())),
    mimeType: asset.mime_type || 'image/jpeg'
  };
}
