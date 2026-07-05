import { json, methodNotAllowed, parseJsonBody } from '../_shared/http.js';
import {
  listProfitSales,
  ProfitValidationError,
  saveProfitSale,
  voidProfitSale
} from '../_shared/profit-service.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  return json(200, {
    rows: await listProfitSales(context.env, {
      month: url.searchParams.get('month'),
      type: url.searchParams.get('type'),
      status: url.searchParams.get('status'),
      machineId: url.searchParams.get('machineId'),
      search: url.searchParams.get('search'),
      limit: url.searchParams.get('limit')
    })
  });
}

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  try {
    return json(200, { record: await saveProfitSale(context.env, body || {}) });
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
    return json(200, { record: await voidProfitSale(context.env, id) });
  } catch (error) {
    if (error instanceof ProfitValidationError) return json(400, { message: error.message });
    throw error;
  }
}

export function onRequest() {
  return methodNotAllowed();
}
