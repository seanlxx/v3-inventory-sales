import { createSalesOrder } from '../_shared/inventory-service.js';
import { json, methodNotAllowed, parseJsonBody } from '../_shared/http.js';

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  return json(200, await createSalesOrder(context.env, body || {}, 'loss'));
}

export function onRequest() {
  return methodNotAllowed();
}
