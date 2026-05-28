import { parseJsonBody, json, methodNotAllowed } from '../../_shared/http.js';
import { preImportZnProducts } from '../../_shared/zn/importer.js';

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  try {
    const result = await preImportZnProducts(context.env, body || {});
    return json(200, result);
  } catch (error) {
    return json(400, { message: error instanceof Error ? error.message : 'zn 商品预导入失败' });
  }
}

export function onRequest() {
  return methodNotAllowed();
}
