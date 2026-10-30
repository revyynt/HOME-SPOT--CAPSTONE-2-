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
    console.error('Failed to look up tenant for archiving:', lookupError);
    return jsonResponse(request, { error: 'Could not look up the tenant account.' }, 500);
  }

  const now = new Date().toISOString();
  const existingData = (tenantRow?.data as Record<string, unknown>) || {};
  const archivedData = {
    ...existingData,
    status: 'Archived',
    room: '',
    previousRoom: existingData.room || '',
    archivedAt: now
  };

  const { error: tenantArchiveError } = await admin
    .from('app_documents')
    .update({ data: archivedData })
    .eq('collection', 'tenants')
    .eq('id', input.tenantId);
  if (tenantArchiveError) {
    console.error('Failed to archive tenant record:', tenantArchiveError);
    return jsonResponse(request, { error: 'Could not archive the tenant profile record.' }, 500);
  }

  await admin
    .from('tenants')
    .update({ status: 'Archived', room_id: null, updated_at: now })
    .eq('id', input.tenantId);

  return jsonResponse(request, { success: true, archived: true });
});
