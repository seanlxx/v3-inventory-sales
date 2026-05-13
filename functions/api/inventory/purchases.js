import { createPurchases, getPurchase, getPurchaseOrder, listPurchaseOrders, listPurchases, updatePurchase, voidDocument } from '../_shared/inventory-service.js';
import { json, methodNotAllowed, parseJsonBody } from '../_shared/http.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  const grouped = url.searchParams.get('grouped') === '1' || url.searchParams.get('format') === 'orders';
  const datePrefix = url.searchParams.get('month') || url.searchParams.get('datePrefix');
  if (grouped) {
    if (id) return json(200, await getPurchaseOrder(context.env, id));
    return json(200, await listPurchaseOrders(context.env, {
      productId: url.searchParams.get('productId'),
      datePrefix,
      status: url.searchParams.get('status') || 'active',
      limit: url.searchParams.get('limit'),
      offset: url.searchParams.get('offset')
    }));
  }
  if (id) return json(200, await getPurchase(context.env, id));
  return json(200, await listPurchases(context.env, {
    productId: url.searchParams.get('productId'),
    datePrefix,
    limit: url.searchParams.get('limit'),
    offset: url.searchParams.get('offset')
  }));
}

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  const result = await createPurchases(context.env, body || {});
  if (Array.isArray(body?.items)) return json(200, result.purchase);
  return json(200, Array.isArray(body?.purchases) ? result : result.purchases[0]);
}

export async function onRequestPut(context) {
  const id = new URL(context.request.url).searchParams.get('id');
  if (!id) return json(400, { message: 'Missing purchase id' });
  const body = await parseJsonBody(context.request);
  return json(200, await updatePurchase(context.env, id, body || {}));
}

export async function onRequestDelete(context) {
  const id = new URL(context.request.url).searchParams.get('id');
  if (!id) {
    await context.env.DB.batch([
      context.env.DB.prepare("DELETE FROM stock_movements WHERE ref_type = 'purchase_order'"),
      context.env.DB.prepare('DELETE FROM purchase_items'),
      context.env.DB.prepare('DELETE FROM purchase_orders')
    ]);
    return json(204, null);
  }
  await voidDocument(context.env, { refType: 'purchase_order', id });
  return json(204, null);
}

export function onRequest() {
  return methodNotAllowed();
}
