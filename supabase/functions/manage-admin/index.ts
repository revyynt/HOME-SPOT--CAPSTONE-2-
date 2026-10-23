import { authenticatedUser, adminClient } from '../_shared/auth.ts';
import { jsonResponse, optionsResponse } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  }

  const auth = await authenticatedUser(request);
  if (auth.errorResponse) return auth.errorResponse;
  if (auth.user.app_metadata?.role !== 'superadmin') {
    return jsonResponse(request, { error: 'Access denied. Super Admin privileges required.' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid JSON request.' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action : 'list';
  const admin = adminClient();

  // 1. LIST ADMINS
  if (action === 'list') {
    try {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;

      const staffUsers = (data.users || [])
        .filter((u) => ['admin', 'superadmin'].includes(u.app_metadata?.role))
        .map((u) => {
          const isBanned = Boolean(
            u.banned_until && new Date(u.banned_until).getTime() > Date.now()
          );
          return {
            id: u.id,
            email: u.email || '',
            name:
              (u.user_metadata?.name as string) ||
              (u.user_metadata?.fullName as string) ||
              u.email?.split('@')[0] ||
              'Admin',
            role: (u.app_metadata?.role as string) || 'admin',
            phone: (u.user_metadata?.phone as string) || '',
            status: isBanned ? 'Suspended' : 'Active',
            createdAt: u.created_at,
            isCurrent: u.id === auth.user.id
          };
        });

      return jsonResponse(request, { admins: staffUsers });
    } catch (err: unknown) {
      console.error('Failed to list staff:', err);
      return jsonResponse(request, { error: 'Failed to retrieve admin accounts.' }, 500);
    }
  }

  // 2. CREATE ADMIN
  if (action === 'create') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const role = body.role === 'superadmin' ? 'superadmin' : 'admin';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse(request, { error: 'A valid email address is required.' }, 400);
    }
    if (!password || password.length < 6) {
      return jsonResponse(request, { error: 'Password must be at least 6 characters long.' }, 400);
    }
    if (!name) {
      return jsonResponse(request, { error: 'Admin full name is required.' }, 400);
    }

    try {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role },
        user_metadata: { name, role, phone }
      });
      if (error || !data.user) {
        return jsonResponse(
          request,
          { error: error?.message || 'Could not create admin account.' },
          400
        );
      }

      // Sync into public.profiles
      try {
        await admin.from('profiles').upsert({
          id: data.user.id,
          email,
          name,
          role,
          phone: phone || null,
          updated_at: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Profiles upsert warning:', e);
      }

      return jsonResponse(request, {
        success: true,
        admin: {
          id: data.user.id,
          email,
          name,
          role,
          phone,
          status: 'Active',
          createdAt: data.user.created_at
        }
      });
    } catch (err: unknown) {
      console.error('Create admin error:', err);
      return jsonResponse(request, { error: 'Failed to provision admin account.' }, 500);
    }
  }

  // 3. TOGGLE SUSPEND ADMIN
  if (action === 'toggle-suspend') {
    const targetUserId = typeof body.userId === 'string' ? body.userId : '';
    if (!targetUserId) {
      return jsonResponse(request, { error: 'User ID is required.' }, 400);
    }
    if (targetUserId === auth.user.id) {
      return jsonResponse(request, { error: 'You cannot suspend your own account.' }, 400);
    }

    try {
      const { data: targetUser, error: getErr } = await admin.auth.admin.getUserById(targetUserId);
      if (getErr || !targetUser.user) {
        return jsonResponse(request, { error: 'Admin user not found.' }, 404);
      }

      const isBanned = Boolean(
        targetUser.user.banned_until &&
        new Date(targetUser.user.banned_until).getTime() > Date.now()
      );
      const nextBanDuration = isBanned ? 'none' : '876600h'; // ~100 years or unban

      const { error: updateErr } = await admin.auth.admin.updateUserById(targetUserId, {
        ban_duration: nextBanDuration
      });
      if (updateErr) throw updateErr;

      return jsonResponse(request, {
        success: true,
        suspended: !isBanned,
        status: !isBanned ? 'Suspended' : 'Active'
      });
    } catch (err: unknown) {
      console.error('Toggle suspend error:', err);
      return jsonResponse(request, { error: 'Failed to update admin account status.' }, 500);
    }
  }

  // 4. DELETE ADMIN
  if (action === 'delete') {
    const targetUserId = typeof body.userId === 'string' ? body.userId : '';
    if (!targetUserId) {
      return jsonResponse(request, { error: 'User ID is required.' }, 400);
    }
    if (targetUserId === auth.user.id) {
      return jsonResponse(request, { error: 'You cannot delete your own account.' }, 400);
    }

    try {
      const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
      if (delErr) throw delErr;

      // Clean up profiles
      try {
        await admin.from('profiles').delete().eq('id', targetUserId);
      } catch (e) {
        console.warn('Profiles delete warning:', e);
      }

      return jsonResponse(request, { success: true });
    } catch (err: unknown) {
      console.error('Delete admin error:', err);
      return jsonResponse(request, { error: 'Failed to delete admin account.' }, 500);
    }
  }

  return jsonResponse(request, { error: `Unrecognized action: ${action}` }, 400);
});
