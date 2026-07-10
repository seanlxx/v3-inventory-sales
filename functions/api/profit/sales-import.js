import { json, methodNotAllowed, parseJsonBody } from '../_shared/http.js';
import {
  importProfitOrders,
  OrderImportValidationError
} from '../_shared/profit-order-import.js';

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  try {
    return json(200, await importProfitOrders(context.env, body || {}));
  } catch (error) {
    if (error instanceof OrderImportValidationError) {
      return json(400, { message: error.message });
    }
    if (String(error?.message || '').includes('UNIQUE')) {
      return json(409, { message: '导入过程中检测到重复订单，请重新预览后再试' });
    }
    throw error;
  }
}

export function onRequest() {
  return methodNotAllowed();
}