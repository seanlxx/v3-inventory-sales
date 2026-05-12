import { isPublicApiRequest, validateSession } from './_shared/auth.js';
import { json } from './_shared/http.js';

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (!context.env.DB) {
    return json(500, { message: 'D1 binding DB is not configured' });
  }

  if (isPublicApiRequest(context.request)) {
    return await context.next();
  }

  const session = await validateSession(context.request, context.env);
  if (!session) {
    return json(401, { message: 'Unauthorized' });
  }

  context.data = { ...(context.data || {}), session };
  return await context.next();
}
