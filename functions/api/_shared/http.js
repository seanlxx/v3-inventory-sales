export function json(status, payload) {
  if (status === 204) {
    return new Response(null, {
      status,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function parseJsonBody(request) {
  return request.json().catch(() => null);
}

export function methodNotAllowed() {
  return json(405, { message: 'Method not allowed' });
}

export function badRequest(message) {
  return json(400, { message });
}
