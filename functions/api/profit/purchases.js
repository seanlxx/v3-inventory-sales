import { json, methodNotAllowed } from '../_shared/http.js';
import { listProfitPurchases } from '../_shared/profit-service.js';

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

export function onRequest() {
  return methodNotAllowed();
}
