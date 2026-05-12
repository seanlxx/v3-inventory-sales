import { voidDocument } from '../_shared/inventory-service.js';
import { json, methodNotAllowed, parseJsonBody } from '../_shared/http.js';

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  return json(200, await voidDocument(context.env, body || {}));
}

export function onRequest() {
  return methodNotAllowed();
}
