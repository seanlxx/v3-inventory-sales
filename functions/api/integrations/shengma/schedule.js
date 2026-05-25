import { parseJsonBody, json, methodNotAllowed } from '../../_shared/http.js';
import { getShengmaSchedule, saveShengmaSchedule } from '../../_shared/shengma/service.js';

export async function onRequestGet(context) {
  return json(200, await getShengmaSchedule(context.env.DB));
}

export async function onRequestPut(context) {
  const body = await parseJsonBody(context.request);
  try {
    const schedule = await saveShengmaSchedule(context.env.DB, body || {});
    return json(200, schedule);
  } catch (error) {
    return json(400, { message: error instanceof Error ? error.message : '保存调度失败' });
  }
}

export async function onRequestPost(context) {
  return await onRequestPut(context);
}

export function onRequest() {
  return methodNotAllowed();
}
