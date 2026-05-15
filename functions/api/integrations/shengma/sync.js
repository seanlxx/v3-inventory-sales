import { parseJsonBody, json, methodNotAllowed } from '../../_shared/http.js';
import { runShengmaSync } from '../../_shared/shengma/service.js';

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  try {
    return json(200, await runShengmaSync(context.env, body || {}));
  } catch (error) {
    if (error?.run) return json(400, { ...error.run, message: error.message });
    return json(400, { message: error instanceof Error ? error.message : '盛码同步失败' });
  }
}

export function onRequest() {
  return methodNotAllowed();
}
