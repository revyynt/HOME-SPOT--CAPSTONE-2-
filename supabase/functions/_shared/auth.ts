import { createClient, type User } from 'npm:@supabase/supabase-js@2';
import { jsonResponse } from './http.ts';

export async function authenticatedUser(
  request: Request
): Promise<{ user: User; errorResponse: null } | { user: null; errorResponse: Response }> {
  const authorization = request.headers.get('authorization');
  const apiKey = request.headers.get('apikey');
  if (!authorization?.startsWith('Bearer ') || !apiKey) {
    return {
      user: null,
      errorResponse: jsonResponse(request, { error: 'Sign-in is required.' }, 401)
    };
  }

  const client = createClient(Deno.env.get('SUPABASE_URL')!, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } }
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return {
      user: null,
      errorResponse: jsonResponse(request, { error: 'Your session is invalid or expired.' }, 401)
    };
  }

  return { user: data.user, errorResponse: null };
}

export function adminClient() {
  const configuredKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  const secretKey = configuredKeys
    ? JSON.parse(configuredKeys).default
    : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secretKey) throw new Error('Configure a Supabase secret key for privileged operations.');

  return createClient(Deno.env.get('SUPABASE_URL')!, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
