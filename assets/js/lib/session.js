/**
 * Shared staff-session helpers.
 *
 * The logout handler and the mobile back-button guard were duplicated verbatim
 * across admin-dashboard.html and super-admin-dashboard.html (~70 lines each).
 * There is now one implementation used by both.
 */

import { supabase } from '../supabase-service.js';

const SIGNOUT_TIMEOUT_MS = 2000;

/**
 * Signs the staff member out and returns to the login page.
 *
 * The timeout exists so a slow signOut cannot strand the user on a dashboard
 * they no longer have access to.
 *
 * @param {string} [redirectTo]
 */
export async function logoutStaff(redirectTo = './login.html') {
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise((resolve) => setTimeout(resolve, SIGNOUT_TIMEOUT_MS))
    ]);
  } catch (error) {
    console.error('Error signing out:', error);
  } finally {
    sessionStorage.clear();
    try {
      Object.keys(localStorage).forEach((key) => {
        const lower = key.toLowerCase();
        if (
          lower.startsWith('sb-') ||
          lower.includes('admin') ||
          lower.includes('auth') ||
          lower.includes('token') ||
          lower.includes('session')
        ) {
          localStorage.removeItem(key);
        }
      });
    } catch {
      // Ignore localStorage errors
    }
    window.location.href = redirectTo;
  }
}

/**
 * Wires logout buttons with click + touch support and double-click protection.
 *
 * Bound by delegation rather than by scanning for `onclick*="logoutAdmin"`,
 * which meant the handler only worked if that literal attribute was present.
 *
 * @param {string} [selector]
 */
export function initLogoutButtons(selector = '[data-action="logout"]') {
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.pointerEvents = 'none';

    logoutStaff();
  });

  // Touch feedback; the click handler above performs the sign-out so a tap
  // does not double-fire.
  for (const type of ['touchstart', 'touchend']) {
    document.addEventListener(
      type,
      (event) => {
        const button = event.target instanceof Element ? event.target.closest(selector) : null;
        if (!button) return;
        button.style.opacity = type === 'touchstart' ? '0.7' : '1';
      },
      { passive: true }
    );
  }
}

/**
 * Discourages the mobile back button from leaving an authenticated dashboard.
 *
 * This is user-experience only. The real protection is that the auth guard
 * re-checks the session on every load, so a back-navigation is bounced anyway.
 *
 * @param {string} pageName
 */
export function initBackButtonGuard(pageName = 'dashboard') {
  window.history.pushState({ page: pageName }, '', window.location.href);
  window.history.pushState({ page: pageName }, '', window.location.href);

  window.addEventListener('popstate', () => {
    window.history.pushState({ page: pageName }, '', window.location.href);
  });

  let lastX = 0;

  document.addEventListener(
    'touchstart',
    (event) => {
      lastX = event.touches[0].clientX;
    },
    { passive: true }
  );

  document.addEventListener(
    'touchend',
    (event) => {
      // A left-to-right swipe is the iOS back gesture.
      if (event.changedTouches[0].clientX > lastX + 100) {
        event.preventDefault();
        window.history.pushState({ page: pageName }, null, window.location.href);
      }
    },
    { passive: false }
  );
}
