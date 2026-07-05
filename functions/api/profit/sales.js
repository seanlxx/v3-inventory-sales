import { json, methodNotAllowed } from '../_shared/http.js';
import { listProfitSales } from '../_shared/profit-service.js';

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

export function onRequest() {
  return methodNotAllowed();
}
