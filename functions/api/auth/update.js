import { updateAuth } from '../_shared/auth.js';
import { methodNotAllowed, parseJsonBody } from '../_shared/http.js';

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  return await updateAuth(context, body);
}

export function onRequest() {
  return methodNotAllowed();
}
