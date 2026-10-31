/**
 * Platform Maintenance Mode Guard.
 *
 * Subscribes in real-time to adminTokens/system_settings.
 * - When maintenanceMode is true:
 *   - Public visitors (and Incognito tabs) see a full-screen branded maintenance overlay.
 *   - Clicking "Staff / Admin Portal Sign In" opens a sleek inline modal for administrators.
 *   - If logged in as staff (admin/superadmin), an admin preview banner allows
 *     bypassing the overlay so staff can test and inspect the site.
 * - When maintenanceMode is false:
 *   - All overlays and banners are immediately removed.
 */

import { supabase, supabaseData } from '../supabase-service.js';

let maintenanceBanner = null;

function renderOverlay(isStaff = false) {
  let overlay = document.getElementById('platform-maintenance-overlay');
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.id = 'platform-maintenance-overlay';
  overlay.className =
    'fixed inset-0 bg-slate-900/95 backdrop-blur-md z-[9999999] flex items-center justify-center p-4 font-sans text-slate-800';
  overlay.style.cssText =
    'position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999999; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.95); padding: 1rem;';

  const staffSection = isStaff
    ? `
      <div class="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 text-left" style="background: #fffbeb; border: 1px solid #fde68a; padding: 0.75rem; border-radius: 0.75rem; color: #92400e; margin-top: 1rem;">
        <p class="font-bold flex items-center gap-1.5 mb-1" style="font-weight: 700; margin-bottom: 0.25rem;">
          Staff Session Detected (Admin / Super Admin)
        </p>
        <p class="text-[11px] text-amber-700" style="font-size: 11px; color: #b45309; margin: 0;">
          Public visitors currently see this maintenance notice. As staff, you can bypass this overlay to inspect the live website.
        </p>
      </div>
      <div class="mt-4 flex items-center justify-center gap-3" style="margin-top: 1rem; display: flex; justify-content: center;">
        <button type="button" id="btn-admin-bypass-overlay"
          class="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          style="padding: 0.5rem 1rem; background: #0f172a; color: #ffffff; border-radius: 0.5rem; font-size: 12px; font-weight: 600; cursor: pointer; border: none;">
          Dismiss &amp; Preview Site as Staff →
        </button>
      </div>
    `
    : `
      <div class="flex items-center justify-center gap-4 text-xs mt-4" style="margin-top: 1rem; text-align: center;">
        <button type="button" id="btn-open-staff-login-modal"
          class="text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2 cursor-pointer bg-transparent border-none"
          style="color: #2563eb; font-size: 12px; text-decoration: underline; background: transparent; border: none; cursor: pointer; font-family: inherit;">
          Staff / Admin Portal Sign In
        </button>
      </div>
    `;

  overlay.innerHTML = `
    <div class="bg-white max-w-lg w-full rounded-2xl shadow-2xl p-8 border border-slate-100 text-center relative overflow-hidden"
      style="background: #ffffff; max-width: 32rem; width: 100%; border-radius: 1rem; padding: 2rem; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); text-align: center; font-family: system-ui, -apple-system, sans-serif;">
      <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-inner"
        style="width: 4rem; height: 4rem; background: #fef3c7; color: #d97706; border-radius: 1rem; margin: 0 auto 1.5rem auto; display: flex; align-items: center; justify-content: center;">
        <svg class="w-8 h-8" style="width: 2rem; height: 2rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      </div>
      <span class="inline-block px-3 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full uppercase tracking-wider mb-3"
        style="display: inline-block; padding: 0.25rem 0.75rem; background: #fffbeb; color: #b45309; font-size: 11px; font-weight: 700; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">
        System Maintenance
      </span>
      <h2 class="text-2xl font-bold text-gray-900 tracking-tight mb-3"
        style="font-size: 1.5rem; font-weight: 700; color: #0f172a; margin-bottom: 0.75rem; margin-top: 0;">
        HomeSpot Under Maintenance
      </h2>
      <p class="text-sm text-gray-600 leading-relaxed mb-6"
        style="font-size: 0.875rem; color: #475569; line-height: 1.5; margin-bottom: 1.5rem;">
        We are currently upgrading our platform to serve you better. Public bookings and requests are temporarily paused. We will be back online shortly!
      </p>
      <div class="bg-slate-50 rounded-xl p-4 text-xs text-slate-500 mb-4 border border-slate-100 flex items-center justify-center gap-2"
        style="background: #f8fafc; border: 1px solid #f1f5f9; padding: 0.75rem; border-radius: 0.75rem; font-size: 12px; color: #64748b; margin-bottom: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
        <svg class="w-4 h-4 text-slate-400" style="width: 1rem; height: 1rem; color: #94a3b8;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Need urgent assistance? Call <strong>(63+) 0933-810-0819</strong></span>
      </div>
      ${staffSection}
    </div>

    <!-- Staff Login Modal -->
    <div id="staff-login-modal"
      style="display: none; position: fixed; inset: 0; z-index: 10000000; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(4px); padding: 1rem;">
      <div
        style="background: #ffffff; border-radius: 1rem; max-width: 24rem; width: 100%; padding: 1.75rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); text-align: left; font-family: system-ui, -apple-system, sans-serif;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid #f1f5f9;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="width: 2.25rem; height: 2.25rem; background: #eff6ff; color: #2563eb; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;">
              HS
            </div>
            <div>
              <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: #0f172a;">Staff Portal Login</h3>
              <p style="font-size: 11px; margin: 0; color: #64748b;">Administrator &amp; Super Admin</p>
            </div>
          </div>
          <button type="button" id="btn-close-staff-modal"
            style="border: none; background: transparent; cursor: pointer; color: #94a3b8; font-size: 1.5rem; line-height: 1; padding: 0.25rem;">
            &times;
          </button>
        </div>

        <form id="staff-modal-login-form" style="display: flex; flex-direction: column; gap: 0.875rem;">
          <div id="staff-modal-error"
            style="display: none; font-size: 12px; color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; padding: 0.6rem 0.75rem; border-radius: 0.5rem; line-height: 1.4;">
          </div>

          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 0.25rem;">
              Staff Email
            </label>
            <input type="email" id="staff-modal-email" required placeholder="admin@homespot.com"
              style="width: 100%; font-size: 13px; padding: 0.55rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; box-sizing: border-box; outline: none; font-family: inherit;" />
          </div>

          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 0.25rem;">
              Password
            </label>
            <input type="password" id="staff-modal-password" required placeholder="••••••••"
              style="width: 100%; font-size: 13px; padding: 0.55rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; box-sizing: border-box; outline: none; font-family: inherit;" />
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #f8fafc;">
            <button type="button" id="btn-cancel-staff-modal"
              style="padding: 0.5rem 0.875rem; font-size: 12px; border: 1px solid #cbd5e1; background: #ffffff; border-radius: 0.5rem; cursor: pointer; color: #475569; font-weight: 500;">
              Cancel
            </button>
            <button type="submit" id="btn-submit-staff-login"
              style="padding: 0.5rem 1.1rem; font-size: 12px; font-weight: 600; background: #2563eb; color: #ffffff; border: none; border-radius: 0.5rem; cursor: pointer; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">
              Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const mount = () => {
    if (document.body && !document.getElementById('platform-maintenance-overlay')) {
      document.body.appendChild(overlay);

      // Staff bypass button (when already logged in as staff)
      if (isStaff) {
        const bypassBtn = document.getElementById('btn-admin-bypass-overlay');
        bypassBtn?.addEventListener('click', () => {
          sessionStorage.setItem('homespot_staff_bypassed_maintenance', 'true');
          removeOverlay();
          renderStaffBanner();
        });
      }

      // Inline modal handlers
      const modal = document.getElementById('staff-login-modal');
      const openModalBtn = document.getElementById('btn-open-staff-login-modal');
      const closeModalBtn = document.getElementById('btn-close-staff-modal');
      const cancelModalBtn = document.getElementById('btn-cancel-staff-modal');
      const form = document.getElementById('staff-modal-login-form');
      const errorEl = document.getElementById('staff-modal-error');
      const submitBtn = document.getElementById('btn-submit-staff-login');

      const showModal = () => {
        if (modal) {
          modal.style.display = 'flex';
          if (errorEl) errorEl.style.display = 'none';
          document.getElementById('staff-modal-email')?.focus();
        }
      };

      const hideModal = () => {
        if (modal) {
          modal.style.display = 'none';
          form?.reset();
        }
      };

      openModalBtn?.addEventListener('click', showModal);
      closeModalBtn?.addEventListener('click', hideModal);
      cancelModalBtn?.addEventListener('click', hideModal);

      // Close modal on click outside
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) hideModal();
      });

      // Submit staff credentials
      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('staff-modal-email')?.value?.trim().toLowerCase();
        const password = document.getElementById('staff-modal-password')?.value;

        if (!email || !password) return;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Verifying...';
        }
        if (errorEl) errorEl.style.display = 'none';

        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;

          const role = data.user?.app_metadata?.role;
          if (role === 'superadmin') {
            window.location.href = './super-admin-dashboard.html';
          } else if (role === 'admin') {
            window.location.href = './admin-dashboard.html';
          } else {
            await supabase.auth.signOut();
            throw new Error('Access denied. Administrator privileges required.');
          }
        } catch (err) {
          if (errorEl) {
            errorEl.textContent = err.message || 'Login failed. Please verify credentials.';
            errorEl.style.display = 'block';
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
          }
        }
      });
    }
  };

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }
}

function removeOverlay() {
  const overlay = document.getElementById('platform-maintenance-overlay');
  if (overlay) overlay.remove();
}

function renderStaffBanner() {
  if (maintenanceBanner || document.getElementById('staff-maintenance-banner')) return;
  maintenanceBanner = document.createElement('div');
  maintenanceBanner.id = 'staff-maintenance-banner';
  maintenanceBanner.className =
    'fixed top-0 left-0 right-0 bg-amber-500 text-white text-xs font-semibold px-4 py-2 flex items-center justify-between shadow-lg z-[99999]';
  maintenanceBanner.style.cssText =
    'position: fixed; top: 0; left: 0; right: 0; background: #f59e0b; color: #ffffff; font-size: 12px; font-weight: 600; padding: 0.5rem 1rem; display: flex; align-items: center; justify-content: space-between; z-index: 99999; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); font-family: system-ui, sans-serif;';
  maintenanceBanner.innerHTML = `
    <div class="flex items-center gap-2 mx-auto" style="display: flex; align-items: center; gap: 0.5rem; margin: 0 auto;">
      <svg class="w-4 h-4" style="width: 1rem; height: 1rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span>Platform Maintenance Mode is active. Public visitors are blocked. Viewing as Staff.</span>
      <button type="button" id="btn-reopen-maintenance-preview"
        style="margin-left: 1rem; text-decoration: underline; background: transparent; border: none; color: #ffffff; cursor: pointer; font-size: 11px;">
        Show Notice Overlay
      </button>
    </div>
  `;

  const mount = () => {
    if (document.body && !document.getElementById('staff-maintenance-banner')) {
      document.body.appendChild(maintenanceBanner);

      document.getElementById('btn-reopen-maintenance-preview')?.addEventListener('click', () => {
        sessionStorage.removeItem('homespot_staff_bypassed_maintenance');
        removeStaffBanner();
        renderOverlay(true);
      });
    }
  };

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }
}

function removeStaffBanner() {
  if (maintenanceBanner) {
    maintenanceBanner.remove();
    maintenanceBanner = null;
  }
  const el = document.getElementById('staff-maintenance-banner');
  if (el) el.remove();
}

export function initMaintenanceGuard() {
  const path = window.location.pathname.toLowerCase();
  const isAdminScreen =
    path.includes('super-admin-dashboard') ||
    path.includes('admin-dashboard') ||
    path.includes('admin-login');

  const settingsDocRef = supabaseData.doc(supabase, 'adminTokens', 'system_settings');

  supabaseData.onSnapshot(
    settingsDocRef,
    async (snap) => {
      let isMaintenanceActive = false;
      if (snap && typeof snap.exists === 'function') {
        isMaintenanceActive = Boolean(snap.exists() && snap.data()?.maintenanceMode);
      } else if (snap && Array.isArray(snap.docs) && snap.docs[0]) {
        isMaintenanceActive = Boolean(snap.docs[0].data()?.maintenanceMode);
      } else if (snap && typeof snap.data === 'function') {
        isMaintenanceActive = Boolean(snap.data()?.maintenanceMode);
      } else if (snap && snap.data) {
        isMaintenanceActive = Boolean(snap.data?.maintenanceMode);
      }

      if (!isMaintenanceActive) {
        removeOverlay();
        removeStaffBanner();
        sessionStorage.removeItem('homespot_staff_bypassed_maintenance');
        return;
      }

      // Check if user is staff
      let isStaff = false;
      try {
        const { data } = await supabase.auth.getUser();
        const role = data?.user?.app_metadata?.role;
        if (role === 'admin' || role === 'superadmin') {
          isStaff = true;
        }
      } catch {
        // Ignored
      }

      if (isAdminScreen) {
        if (isStaff) {
          renderStaffBanner();
        }
        return;
      }

      if (isStaff) {
        const hasBypassed =
          sessionStorage.getItem('homespot_staff_bypassed_maintenance') === 'true';
        if (hasBypassed) {
          removeOverlay();
          renderStaffBanner();
        } else {
          removeStaffBanner();
          renderOverlay(true);
        }
      } else {
        removeStaffBanner();
        renderOverlay(false);
      }
    },
    (err) => {
      console.warn('[maintenance-guard] Snapshot listener failed:', err);
    }
  );
}

// Auto-run on load
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initMaintenanceGuard());
  } else {
    initMaintenanceGuard();
  }
}
