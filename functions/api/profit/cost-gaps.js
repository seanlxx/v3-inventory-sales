import { json, methodNotAllowed } from '../_shared/http.js';
import { listCostGaps, normalizeMonth } from '../_shared/profit-service.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const month = normalizeMonth(url.searchParams.get('month'));
  return json(200, {
    month,
    rows: await listCostGaps(context.env, {
      month,
      machineId: url.searchParams.get('machineId'),
      limit: url.searchParams.get('limit')
    })
  });
}

export function onRequest() {
  return methodNotAllowed();
}
