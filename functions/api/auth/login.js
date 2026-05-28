import { login } from '../_shared/auth.js';
import { json, methodNotAllowed } from '../_shared/http.js';

export async function onRequestPost(context) {
  return await login(context);
}

export function onRequestGet() {
  return json(404, { message: 'Not found' });
}

export function onRequest() {
  return methodNotAllowed();
}
