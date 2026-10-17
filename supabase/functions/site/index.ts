const FUNCTION_PATH = '/functions/v1/site';
const STORAGE_BUCKET = 'homespot-site';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL must be configured for the site function.');
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse('Method not allowed.', 405);
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.pathname === FUNCTION_PATH) {
    return Response.redirect(new URL(`${FUNCTION_PATH}/${requestUrl.search}`, request.url), 308);
  }
  if (!requestUrl.pathname.startsWith(`${FUNCTION_PATH}/`)) {
    return errorResponse('Not found.', 404);
  }

  let objectPath: string;
  try {
    objectPath = decodeURIComponent(requestUrl.pathname.slice(FUNCTION_PATH.length + 1));
  } catch {
    return errorResponse('Invalid asset path.', 400);
  }

  if (objectPath.includes('\\') || objectPath.includes('\0')) {
    return errorResponse('Invalid asset path.', 400);
  }
  const pathSegments = objectPath.split('/');
  if (pathSegments.some((segment) => segment === '.' || segment === '..')) {
    return errorResponse('Invalid asset path.', 400);
  }

  if (!objectPath || objectPath.endsWith('/')) {
    objectPath += 'index.html';
  }

  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const assetUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}`;
  const assetResponse = await fetch(assetUrl, { method: request.method });
  if (!assetResponse.ok) {
    if (assetResponse.status !== 404) {
      console.error('Frontend asset request failed:', assetResponse.status, objectPath);
    }
    return errorResponse(
      assetResponse.status === 404 ? 'Not found.' : 'Frontend assets are temporarily unavailable.',
      assetResponse.status === 404 ? 404 : 502
    );
  }

  const headers = new Headers(assetResponse.headers);
  headers.delete('content-length');
  headers.set('Cache-Control', objectPath.endsWith('.html') ? 'no-cache' : 'public, max-age=300');
  headers.set(
    'Content-Type',
    headers.get('Content-Type') ??
      CONTENT_TYPES[objectPath.slice(objectPath.lastIndexOf('.')).toLowerCase()] ??
      'application/octet-stream'
  );
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return new Response(request.method === 'HEAD' ? null : assetResponse.body, {
    status: 200,
    headers
  });
});
