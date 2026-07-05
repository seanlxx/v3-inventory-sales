import { json, methodNotAllowed, parseJsonBody } from '../_shared/http.js';
import {
  listProfitPurchases,
  ProfitValidationError,
  saveProfitPurchase,
  voidProfitPurchase
} from '../_shared/profit-service.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  return json(200, {
    rows: await listProfitPurchases(context.env, {
      month: url.searchParams.get('month'),
      status: url.searchParams.get('status'),
      search: url.searchParams.get('search'),
      limit: url.searchParams.get('limit')
    })
  });
}

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  try {
    return json(200, { record: await saveProfitPurchase(context.env, body || {}) });
  } catch (error) {
    if (error instanceof ProfitValidationError) return json(400, { message: error.message });
    throw error;
  }
}

export async function onRequestPut(context) {
  return await onRequestPost(context);
}

export async function onRequestPatch(context) {
  const body = await parseJsonBody(context.request);
  const id = body?.id || new URL(context.request.url).searchParams.get('id');
  try {
    return json(200, { record: await voidProfitPurchase(context.env, id) });
  } catch (error) {
    if (error instanceof ProfitValidationError) return json(400, { message: error.message });
    throw error;
  }
}

export function onRequest() {
  return methodNotAllowed();
}
