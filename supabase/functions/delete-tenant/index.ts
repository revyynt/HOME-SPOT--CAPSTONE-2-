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
  if (!tenantRow) {
    await admin.from('tenants').delete().eq('id', input.tenantId);
    return jsonResponse(request, { success: true });
  }

  const userId = tenantRow.data?.uid;

  const { error: tenantDeleteError } = await admin
    .from('app_documents')
    .delete()
    .eq('collection', 'tenants')
    .eq('id', input.tenantId);
  if (tenantDeleteError) {
    console.error('Failed to delete tenant record:', tenantDeleteError);
    return jsonResponse(request, { error: 'Could not remove the tenant profile record.' }, 500);
  }

  await admin.from('tenants').delete().eq('id', input.tenantId);

  if (typeof userId === 'string' && userId) {
    const { data: siblingTenants } = await admin
      .from('app_documents')
      .select('id')
      .eq('collection', 'tenants')
      .eq('data->>uid', userId)
      .limit(1);

    const hasRemainingTenantsWithSameUid =
      Array.isArray(siblingTenants) && siblingTenants.length > 0;

    if (!hasRemainingTenantsWithSameUid) {
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        const msg = String(authDeleteError.message || '').toLowerCase();
        if (!msg.includes('not found') && !msg.includes('user not found')) {
          console.warn(
            'Could not delete tenant Auth account (may already be removed):',
            authDeleteError
          );
        }
      }

      const { error: profileDeleteError } = await admin
        .from('app_documents')
        .delete()
        .eq('collection', 'users')
        .eq('id', userId);
      if (profileDeleteError) {
        console.warn('Failed to delete tenant user profile:', profileDeleteError);
      }
    }
  }

  return jsonResponse(request, { success: true });
});
