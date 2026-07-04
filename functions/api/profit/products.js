import { json, methodNotAllowed } from '../_shared/http.js';
import { listProfitProducts } from '../_shared/profit-service.js';

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

export function onRequest() {
  return methodNotAllowed();
}
