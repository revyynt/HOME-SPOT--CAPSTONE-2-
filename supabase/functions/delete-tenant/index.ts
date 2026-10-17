import { authenticatedUser, adminClient } from '../_shared/auth.ts';
import { jsonResponse, optionsResponse } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  }

  const auth = await authenticatedUser(request);
  if (auth.errorResponse) return auth.errorResponse;
  if (!['admin', 'superadmin'].includes(auth.user.app_metadata?.role)) {
    return jsonResponse(request, { error: 'Only staff can delete tenant accounts.' }, 403);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid JSON request.' }, 400);
  }
  if (typeof input.tenantId !== 'string' || !input.tenantId.trim()) {
    return jsonResponse(request, { error: 'A tenant id is required.' }, 400);
  }

  const admin = adminClient();
  const { data: tenantRow, error: lookupError } = await admin
    .from('app_documents')
    .select('data')
    .eq('collection', 'tenants')
    .eq('id', input.tenantId)
    .maybeSingle();
  if (lookupError) {
    console.error('Failed to look up tenant for deletion:', lookupError);
    return jsonResponse(request, { error: 'Could not look up the tenant account.' }, 500);
  }
  if (!tenantRow) return jsonResponse(request, { error: 'Tenant account not found.' }, 404);

  const userId = tenantRow.data?.uid;
  if (typeof userId === 'string' && userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error('Failed to delete tenant Auth account:', error);
      return jsonResponse(request, { error: 'Could not disable the tenant sign-in account.' }, 500);
    }
  }

  const { error: tenantDeleteError } = await admin
    .from('app_documents')
    .delete()
    .eq('collection', 'tenants')
    .eq('id', input.tenantId);
  if (tenantDeleteError) {
    console.error('Failed to delete tenant record:', tenantDeleteError);
    return jsonResponse(
      request,
      { error: 'The tenant sign-in was removed, but the profile remains.' },
      500
    );
  }

  if (typeof userId === 'string' && userId) {
    const { error: profileDeleteError } = await admin
      .from('app_documents')
      .delete()
      .eq('collection', 'users')
      .eq('id', userId);
    if (profileDeleteError) {
      console.error('Failed to delete tenant user profile:', profileDeleteError);
      return jsonResponse(
        request,
        { error: 'Tenant access was removed, but a profile record remains.' },
        500
      );
    }
  }

  return jsonResponse(request, { success: true });
});
