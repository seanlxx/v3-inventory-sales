import { json, methodNotAllowed, parseJsonBody } from '../_shared/http.js';
import {
  archiveProfitProduct,
  listProfitProducts,
  ProfitValidationError,
  saveProfitProduct
} from '../_shared/profit-service.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  return json(200, {
    rows: await listProfitProducts(context.env, {
      includeArchived: url.searchParams.get('includeArchived'),
      search: url.searchParams.get('search'),
      limit: url.searchParams.get('limit')
    })
  });
}

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  try {
    return json(200, { product: await saveProfitProduct(context.env, body || {}) });
  } catch (error) {
    if (error instanceof ProfitValidationError) return json(400, { message: error.message });
    if (String(error?.message || '').includes('UNIQUE')) return json(400, { message: '已有同名全局商品' });
    throw error;
  }
}

export async function onRequestPut(context) {
  return await onRequestPost(context);
}

export async function onRequestPatch(context) {
  const body = await parseJsonBody(context.request);
  const id = body?.id || body?.productGlobalId || new URL(context.request.url).searchParams.get('id');
  try {
    return json(200, { product: await archiveProfitProduct(context.env, id, body?.status) });
  } catch (error) {
    if (error instanceof ProfitValidationError) return json(400, { message: error.message });
    throw error;
  }
}

export function onRequest() {
  return methodNotAllowed();
}
