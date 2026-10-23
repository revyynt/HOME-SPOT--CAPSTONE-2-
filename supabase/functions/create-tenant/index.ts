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
    return jsonResponse(request, { error: 'Only staff can create tenant accounts.' }, 403);
  }

  let form: Record<string, unknown>;
  try {
    form = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid JSON request.' }, 400);
  }

  const name = typeof form.name === 'string' ? form.name.trim() : '';
  const email = typeof form.email === 'string' ? form.email.trim().toLowerCase() : '';
  const password = typeof form.password === 'string' ? form.password : '';
  const phone = typeof form.phone === 'string' ? form.phone.trim() : '';
  const room = typeof form.room === 'string' ? form.room.trim() : '';
  const monthlyRent = Number(form.monthlyRent);
  const dueDay = Number(form.dueDay);
  const moveInDate = typeof form.moveInDate === 'string' ? form.moveInDate : '';

  if (
    !name ||
    name.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 200 ||
    password.length < 6 ||
    password.length > 128 ||
    !phone ||
    phone.length > 64 ||
    !room ||
    room.length > 120 ||
    !Number.isFinite(monthlyRent) ||
    monthlyRent <= 0 ||
    !Number.isInteger(dueDay) ||
    dueDay < 1 ||
    dueDay > 31 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(moveInDate)
  ) {
    return jsonResponse(
      request,
      { error: 'Check the required tenant details and try again.' },
      400
    );
  }

  const admin = adminClient();
  let userId = '';
  let wasExistingUser = false;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'tenant' }
  });

  if (createError || !created.user) {
    const errMsg = String(createError?.message || '').toLowerCase();
    if (errMsg.includes('already') || errMsg.includes('registered') || errMsg.includes('exists')) {
      const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = listed?.users?.find((u) => u.email?.toLowerCase() === email);
      if (existing) {
        const { error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          app_metadata: { ...(existing.app_metadata || {}), role: 'tenant' }
        });
        if (!updateErr) {
          userId = existing.id;
          wasExistingUser = true;
        }
      }
    }

    if (!userId) {
      return jsonResponse(
        request,
        { error: createError?.message || 'Could not create the tenant account.' },
        400
      );
    }
  } else {
    userId = created.user.id;
  }

  const now = new Date().toISOString();
  const tenantId = crypto.randomUUID();
  const tenant = {
    name,
    email,
    phone,
    emergencyContact: typeof form.emergencyContact === 'string' ? form.emergencyContact.trim() : '',
    room,
    dormName: typeof form.dormName === 'string' ? form.dormName : '',
    moveInDate,
    monthlyRent,
    dueDay,
    leaseTerm: typeof form.leaseTerm === 'string' ? form.leaseTerm : '',
    notes: typeof form.notes === 'string' ? form.notes.trim() : '',
    status: 'Active',
    role: 'tenant',
    uid: userId,
    createdAt: now,
    updatedAt: now
  };
  const profile = {
    name,
    email,
    role: 'tenant',
    room,
    phone,
    dormName: tenant.dormName,
    createdAt: now
  };

  const { error: insertError } = await admin
    .from('app_documents')
    .upsert(
      [
        { collection: 'tenants', id: tenantId, data: tenant },
        { collection: 'users', id: userId, data: profile }
      ],
      { onConflict: 'collection,id' }
    );
  if (insertError) {
    if (!wasExistingUser) {
      const { error: cleanupError } = await admin.auth.admin.deleteUser(userId);
      if (cleanupError) console.error('Failed to remove orphaned tenant auth user:', cleanupError);
    }
    console.error('Failed to save tenant records:', insertError);
    return jsonResponse(
      request,
      { error: `Could not save the tenant profile: ${insertError.message}` },
      500
    );
  }

  return jsonResponse(request, { userId });
});
