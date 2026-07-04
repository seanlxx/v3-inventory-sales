import { json, methodNotAllowed } from '../_shared/http.js';
import { getProfitSummary } from '../_shared/profit-service.js';

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  return json(200, await getProfitSummary(context.env, {
    month: url.searchParams.get('month'),
    days: url.searchParams.get('days'),
    machineId: url.searchParams.get('machineId')
  }));
}

export function onRequest() {
  return methodNotAllowed();
}
