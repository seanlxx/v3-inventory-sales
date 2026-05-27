import { createTransfer, InventoryValidationError } from '../_shared/inventory-service.js';
import { json, methodNotAllowed, parseJsonBody } from '../_shared/http.js';

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  try {
    return json(200, await createTransfer(context.env, body || {}));
  } catch (error) {
    if (error instanceof InventoryValidationError) {
      return json(400, { message: error.message });
    }
    throw error;
  }
}

export function onRequest() {
  return methodNotAllowed();
}
