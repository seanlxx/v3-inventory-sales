import { validateSession } from './_shared/auth.js';
import { json } from './_shared/http.js';

const GUEST_SESSION = {
  username: 'guest',
  expires_at: '9999-12-31T23:59:59.999Z'
};

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (!context.env.DB) {
    return json(500, { message: 'D1 binding DB is not configured' });
  }

  const session = await validateSession(context.request, context.env) || GUEST_SESSION;
  context.data = { ...(context.data || {}), session };
  return await context.next();
}
