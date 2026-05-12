import { archiveProduct, listProducts, saveProduct } from './_shared/inventory-service.js';
import { json, methodNotAllowed, parseJsonBody } from './_shared/http.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  const products = await listProducts(context.env, {
    id,
    machineId: url.searchParams.get('machineId'),
    includeArchived: url.searchParams.get('includeArchived') === '1'
  });
  return json(200, id ? products[0] || null : products);
}

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  const product = await saveProduct(context.env, body || {});
  return json(200, product);
}

export async function onRequestPut(context) {
  return await onRequestPost(context);
}

export async function onRequestDelete(context) {
  const id = new URL(context.request.url).searchParams.get('id');
  if (!id) {
    await context.env.DB.batch([
      context.env.DB.prepare('DELETE FROM sales_items'),
      context.env.DB.prepare('DELETE FROM sales_orders'),
      context.env.DB.prepare('DELETE FROM purchase_items'),
      context.env.DB.prepare('DELETE FROM purchase_orders'),
      context.env.DB.prepare('DELETE FROM stock_movements'),
      context.env.DB.prepare('DELETE FROM inventory_balances'),
      context.env.DB.prepare('DELETE FROM image_assets'),
      context.env.DB.prepare('DELETE FROM products')
    ]);
    return json(204, null);
  }
  await archiveProduct(context.env, id);
  return json(204, null);
}

export function onRequest() {
  return methodNotAllowed();
}
