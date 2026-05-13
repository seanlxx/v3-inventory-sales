import { createSalesOrder, getSale, listSales, updateSalesOrder, voidDocument } from '../_shared/inventory-service.js';
import { json, methodNotAllowed, parseJsonBody } from '../_shared/http.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (id) return json(200, await getSale(context.env, id));
  return json(200, await listSales(context.env, {
    type: url.searchParams.get('type'),
    machineId: url.searchParams.get('machineId'),
    productId: url.searchParams.get('productId'),
    status: url.searchParams.get('status'),
    yearMonth: url.searchParams.get('yearMonth'),
    datePrefix: url.searchParams.get('datePrefix'),
    sinceDate: url.searchParams.get('sinceDate'),
    limit: url.searchParams.get('limit'),
    offset: url.searchParams.get('offset')
  }));
}

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  return json(200, await createSalesOrder(context.env, body || {}, 'sale'));
}

export async function onRequestPut(context) {
  const id = new URL(context.request.url).searchParams.get('id');
  if (!id) return json(400, { message: 'Missing sales order id' });
  const body = await parseJsonBody(context.request);
  return json(200, await updateSalesOrder(context.env, id, body || {}));
}

export async function onRequestDelete(context) {
  const id = new URL(context.request.url).searchParams.get('id');
  if (!id) {
    await context.env.DB.batch([
      context.env.DB.prepare("DELETE FROM stock_movements WHERE ref_type = 'sales_order'"),
      context.env.DB.prepare('DELETE FROM sales_items'),
      context.env.DB.prepare('DELETE FROM sales_orders')
    ]);
    return json(204, null);
  }
  await voidDocument(context.env, { refType: 'sales_order', id });
  return json(204, null);
}

export function onRequest() {
  return methodNotAllowed();
}
