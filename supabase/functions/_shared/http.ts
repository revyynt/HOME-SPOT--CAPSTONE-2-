declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

const LOCAL_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function corsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || LOCAL_ORIGINS.join(','))
    .split(',')
    .map((value: string) => value.trim());
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-region, x-webhook-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function jsonResponse(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

export function optionsResponse(request: Request) {
  const headers = corsHeaders(request);
  if (request.headers.has('origin') && !headers['Access-Control-Allow-Origin']) {
    return new Response(null, { status: 403, headers });
  }
  return new Response(null, { status: 204, headers });
}
