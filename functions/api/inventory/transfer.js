import { json, methodNotAllowed } from '../_shared/http.js';

export function onRequestPost() {
  return json(410, { message: '机间调拨功能已停用' });
}

export function onRequest() {
  return methodNotAllowed();
}
