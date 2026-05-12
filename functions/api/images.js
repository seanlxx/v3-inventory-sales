import { first } from './_shared/d1.js';
import { json, methodNotAllowed } from './_shared/http.js';
import { readImageBase64 } from './_shared/image-service.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const store = url.searchParams.get('store');
  const id = url.searchParams.get('id');
  if (!store || !id) return json(400, { message: 'Missing image target' });

  let row = null;
  if (store === 'purchases') {
    row = await first(context.env.DB, 'SELECT image_asset_id FROM purchase_orders WHERE id = ? LIMIT 1', [id]);
  } else if (store === 'sales') {
    row = await first(context.env.DB, 'SELECT image_asset_id FROM sales_orders WHERE id = ? LIMIT 1', [id]);
  } else {
    return json(400, { message: 'Unsupported image store' });
  }

  const image = await readImageBase64(context.env, row?.image_asset_id);
  return json(200, image ? { store, record_id: id, ...image } : null);
}

export function onRequest() {
  return methodNotAllowed();
}
