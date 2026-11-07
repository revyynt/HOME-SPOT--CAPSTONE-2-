import { authenticatedUser, adminClient } from '../_shared/auth.ts';
import { jsonResponse, optionsResponse } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  }

  const auth = await authenticatedUser(request);
  if (auth.errorResponse) return auth.errorResponse;

  let form: Record<string, unknown>;
  try {
    form = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid JSON request.' }, 400);
  }

  const callerRole = auth.user.app_metadata?.role;
  const isStaff = ['admin', 'superadmin'].includes(callerRole);
  const isSelfClaim = form.mode === 'self-claim' || !isStaff;

  if (isSelfClaim) {
    const admin = adminClient();
    const userId = auth.user.id;
    const email = (auth.user.email || String(form.email || '')).trim().toLowerCase();
    if (!email) {
      return jsonResponse(request, { error: 'Authenticated user has no email address.' }, 400);
    }

    const now = new Date().toISOString();

    const { data: existingTenantDocs } = await admin
      .from('app_documents')
      .select('id, data')
      .eq('collection', 'tenants')
      .ilike('data->>email', email);

    const existingTenantDoc =
      (existingTenantDocs || []).find(
        (d) => String((d.data as Record<string, unknown>)?.status || 'Active') !== 'Archived'
      ) ||
      existingTenantDocs?.[0] ||
      null;

    const { data: reservationDocs } = await admin
      .from('app_documents')
      .select('id, data')
      .eq('collection', 'reservations')
      .ilike('data->>email', email);

    const matchedRow = (reservationDocs || []).find((r) => {
      const s = (r.data as Record<string, unknown>)?.status;
      return s === 'Approved' || s === 'Pending';
    });
    const matchedRes = (matchedRow?.data as Record<string, unknown>) || {};
    const existingData = (existingTenantDoc?.data as Record<string, unknown>) || {};
    const meta = (auth.user.user_metadata || {}) as Record<string, unknown>;

    const resolvedName = String(
      form.name ||
        existingData.name ||
        matchedRes.name ||
        meta.name ||
        meta.full_name ||
        email.split('@')[0]
    ).trim();

    const resolvedPhone = String(
      form.phone || existingData.phone || matchedRes.phone || meta.phone || ''
    ).trim();

    const isApprovedReservation = matchedRow?.data?.status === 'Approved';
    const approvedRoom = isApprovedReservation
      ? String(matchedRes.assignedRoom || matchedRes.room || '').trim()
      : '';

    const resolvedRoom = String(
      existingData.room ||
        approvedRoom ||
        form.preferredRoom ||
        'Unassigned (Pending Admin Assignment)'
    ).trim();

    const isUnassigned =
      !resolvedRoom ||
      resolvedRoom === 'Unassigned (Pending Admin Assignment)' ||
      resolvedRoom.toLowerCase().includes('pending');

    const inquiredUnitLabel = String(
      existingData.inquiredRoom ||
        matchedRes.assignedRoom ||
        matchedRes.room ||
        form.preferredRoom ||
        'Triple Occupancy Room'
    ).trim();

    const isCommercial =
      resolvedRoom.toLowerCase().includes('commercial') ||
      inquiredUnitLabel.toLowerCase().includes('commercial');
    const resolvedDorm = String(
      existingData.dormName || (isCommercial ? 'Commercial Space' : 'Triple Occupancy Room')
    );
    const defaultRent = isCommercial ? 12000 : 10000;
    const resolvedRent = Number(existingData.monthlyRent || matchedRes.amount) || defaultRent;
    const resolvedMoveIn = String(
      existingData.moveInDate || matchedRes.moveInDate || now.slice(0, 10)
    );
    const resolvedDueDay = Number(existingData.dueDay) || 5;
    const roomDigits = resolvedRoom.replace(/\D+/g, '') || '101';

    await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
      app_metadata: { ...(auth.user.app_metadata || {}), role: 'tenant' },
      user_metadata: {
        ...meta,
        role: 'tenant',
        name: resolvedName,
        phone: resolvedPhone,
        room: resolvedRoom,
        termsAccepted: true
      }
    });

    const tenantId = existingTenantDoc?.id || userId;
    const tenant = {
      ...existingData,
      uid: userId,
      name: resolvedName,
      email,
      phone: resolvedPhone,
      emergencyContact: String(existingData.emergencyContact || ''),
      room: resolvedRoom,
      inquiredRoom: inquiredUnitLabel,
      needsAssignment: isUnassigned,
      dormName: resolvedDorm,
      moveInDate: resolvedMoveIn,
      monthlyRent: resolvedRent,
      advanceRent: Number(existingData.advanceRent) || resolvedRent,
      securityDeposit: Number(existingData.securityDeposit) || resolvedRent * 2,
      advanceDeposit: Number(existingData.advanceDeposit) || resolvedRent,
      dueDay: resolvedDueDay,
      leaseTerm: String(existingData.leaseTerm || '6 Months'),
      status: String(existingData.status || (isUnassigned ? 'Pending Assignment' : 'Active')),
      role: 'tenant',
      gateStatus: String(existingData.gateStatus || (isUnassigned ? 'PENDING' : 'OUTSIDE')),
      cardUid: String(
        existingData.cardUid ||
          (isUnassigned ? 'PENDING' : roomDigits ? `NFC-${roomDigits}` : 'PENDING')
      ),
      rulesAgreed: Boolean(existingData.rulesAgreed ?? true),
      termsAccepted: true,
      termsAcceptedAt: String(existingData.termsAcceptedAt || now),
      createdAt: String(existingData.createdAt || now),
      updatedAt: now
    };

    const profile = {
      name: resolvedName,
      email,
      role: 'tenant',
      room: resolvedRoom,
      phone: resolvedPhone,
      dormName: resolvedDorm,
      createdAt: String(existingData.createdAt || now),
      updatedAt: now
    };

    const { error: upsertError } = await admin.from('app_documents').upsert(
      [
        { collection: 'tenants', id: tenantId, data: tenant },
        { collection: 'users', id: userId, data: profile }
      ],
      { onConflict: 'collection,id' }
    );

    if (upsertError) {
      return jsonResponse(
        request,
        { error: `Could not provision tenant profile: ${upsertError.message}` },
        500
      );
    }

    return jsonResponse(request, { userId, tenantId, tenant });
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
  const { data: existingTenantDoc } = await admin
    .from('app_documents')
    .select('id, data')
    .eq('collection', 'tenants')
    .eq('data->>email', email)
    .maybeSingle();

  const tenantId = existingTenantDoc?.id || crypto.randomUUID();
  const existingData = (existingTenantDoc?.data as Record<string, unknown>) || {};
  const tenant = {
    ...existingData,
    name,
    email,
    phone,
    emergencyContact: typeof form.emergencyContact === 'string' ? form.emergencyContact.trim() : '',
    room,
    dormName: typeof form.dormName === 'string' ? form.dormName : '',
    moveInDate,
    monthlyRent,
    advanceRent: Number(form.advanceRent) || monthlyRent,
    securityDeposit: Number(form.securityDeposit) || monthlyRent * 2,
    advanceDeposit: Number(form.advanceDeposit ?? form.advanceRent) || monthlyRent,
    dueDay,
    leaseTerm: typeof form.leaseTerm === 'string' ? form.leaseTerm : '',
    contractSigned: form.contractSigned !== false,
    paymentVerified: form.paymentVerified !== false,
    rulesAgreed: form.rulesAgreed !== false,
    contractFileUrl:
      typeof form.contractFileUrl === 'string' && form.contractFileUrl
        ? form.contractFileUrl
        : String(existingData.contractFileUrl || ''),
    contractFileName:
      typeof form.contractFileName === 'string' && form.contractFileName
        ? form.contractFileName
        : String(existingData.contractFileName || ''),
    contractFileType:
      typeof form.contractFileType === 'string' && form.contractFileType
        ? form.contractFileType
        : String(existingData.contractFileType || ''),
    contractUploadedAt:
      typeof form.contractUploadedAt === 'string' && form.contractUploadedAt
        ? form.contractUploadedAt
        : String(existingData.contractUploadedAt || ''),
    notes: typeof form.notes === 'string' ? form.notes.trim() : '',
    status: 'Active',
    role: 'tenant',
    uid: userId,
    createdAt: (typeof existingData.createdAt === 'string' && existingData.createdAt) || now,
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

  const { error: insertError } = await admin.from('app_documents').upsert(
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
