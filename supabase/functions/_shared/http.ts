declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
];

function getSupabaseOrigin() {
  try {
    const sbUrl = Deno.env.get('SUPABASE_URL');
    return sbUrl ? [new URL(sbUrl).origin] : [];
  } catch {
    return [];
  }
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === '*' || LOCAL_ORIGINS.includes(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith('.vercel.app') || url.hostname === 'vercel.app') return true;
    if (getSupabaseOrigin().includes(url.origin)) return true;
    const configured = (Deno.env.get('ALLOWED_ORIGINS') || '')
      .split(',')
      .map((v: string) => v.trim())
      .filter(Boolean);
    return configured.includes(origin) || configured.includes('*');
  } catch {
    return false;
  }
}

export function corsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-region, x-webhook-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
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
