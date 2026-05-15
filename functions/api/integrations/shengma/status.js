import { getShengmaStatus } from '../../_shared/shengma/service.js';
import { json, methodNotAllowed } from '../../_shared/http.js';

export async function onRequestGet(context) {
  return json(200, await getShengmaStatus(context.env));
}

export function onRequest() {
  return methodNotAllowed();
}

