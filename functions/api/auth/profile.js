import { authProfile } from '../_shared/auth.js';
import { methodNotAllowed } from '../_shared/http.js';

export async function onRequestGet(context) {
  return await authProfile(context);
}

export function onRequest() {
  return methodNotAllowed();
}
