import { login } from '../_shared/auth.js';
import { json, methodNotAllowed, parseJsonBody } from '../_shared/http.js';

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  return await login(context, body);
}

export function onRequestGet() {
  return json(404, { message: 'Not found' });
}

export function onRequest() {
  return methodNotAllowed();
}
