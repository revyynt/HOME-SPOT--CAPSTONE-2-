/**
 * Unified sign-in for every account type.
 *
 * There is one login form for the whole app. After the credentials check, this
 * works out where the person belongs:
 *
 *   role 'superadmin' -> platform dashboard
 *   role 'admin'      -> admin dashboard
 *   role 'tenant'     -> tenant portal
 *   no role + a tenant profile -> tenant portal (legacy tenants provisioned
 *                                 before the users document existed)
 *   neither           -> sign out and say why
 *
 * The decision itself lives in ../lib/login-routing.js so it is unit-tested;
 * this module only performs the I/O it implies.
 *
 * Previously tenant-login.html and tenant-login.js handled this separately,
 * which meant two forms and two places to send people who hit the wrong one.
 */

import { auth, db, firebaseFirestore } from '../firebase-service.js';
import {
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { resolveDestination, noDestinationMessage } from '../lib/login-routing.js';

const ERROR_MESSAGES = {
  'auth/invalid-email': 'Invalid email address.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Try again later.',
  'auth/user-disabled': 'This user has been disabled.',
  'auth/user-not-found': 'No account found with these credentials.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/unauthorized-domain': 'This domain is not authorised for sign-in.'
};

const loginForm = document.getElementById('loginForm');
const rememberCheckbox = document.getElementById('remember');
const loginErrorContainer = document.getElementById('loginError');

function showError(message) {
  if (!loginErrorContainer) return;
  loginErrorContainer.className =
    'mt-4 p-3 rounded bg-red-50 text-red-700 text-sm border border-red-200';
  loginErrorContainer.textContent = message;
  loginErrorContainer.classList.remove('hidden');
}

function clearError() {
  if (!loginErrorContainer) return;
  loginErrorContainer.textContent = '';
  loginErrorContainer.classList.add('hidden');
}

/**
 * The role on `users/{uid}`, or null when the account has no such document.
 * @param {string} uid
 * @returns {Promise<string|null>}
 */
async function readRole(uid) {
  try {
    const snap = await firebaseFirestore.getDoc(firebaseFirestore.doc(db, 'users', uid));
    return snap.exists() ? snap.data().role ?? null : null;
  } catch (error) {
    // Previously swallowed, which made a denied read indistinguishable from a
    // genuinely absent role document. Say which it was.
    console.error('[auth] readRole failed for', uid, error?.code || error);
    return null;
  }
}

/**
 * Whether this account has a tenant profile.
 *
 * firestore.rules scopes this read to the signed-in tenant themself (matched on
 * uid or on their own email), so this cannot read anyone else's record.
 *
 * @param {string} uid
 * @param {string} email
 * @returns {Promise<{data: Object, docId: string|null}>}
 */
async function loadTenantProfile(uid, email) {
  const empty = { data: {}, docId: null };
  try {
    // Prefer the uid link; fall back to email for tenants created before the
    // uid was recorded.
    let query = firebaseFirestore.query(
      firebaseFirestore.collection(db, 'tenants'),
      firebaseFirestore.where('uid', '==', uid)
    );
    let snapshot = await firebaseFirestore.getDocs(query);

    if (snapshot.empty) {
      query = firebaseFirestore.query(
        firebaseFirestore.collection(db, 'tenants'),
        firebaseFirestore.where('email', '==', email)
      );
      snapshot = await firebaseFirestore.getDocs(query);
    }

    if (snapshot.empty) return empty;
    return { data: snapshot.docs[0].data(), docId: snapshot.docs[0].id };
  } catch (error) {
    // A missing profile is not a login failure.
    console.warn('Tenant profile lookup failed:', error);
    return empty;
  }
}

/**
 * Mirrors the tenant profile into sessionStorage, which the portal reads.
 * @param {{data: Object, docId: string|null}} profile
 * @param {string} email
 */
function seedTenantSession(profile, email) {
  const data = profile.data || {};

  sessionStorage.setItem('tenantLoggedIn', 'true');
  sessionStorage.setItem('tenantEmail', email);
  sessionStorage.setItem('tenantName', data.name || email.split('@')[0]);
  sessionStorage.setItem('tenantPhone', data.phone || '');
  sessionStorage.setItem('tenantRoom', data.room || '');
  sessionStorage.setItem('tenantDorm', data.dormName || '');
  sessionStorage.setItem('tenantMoveInDate', data.moveInDate || '');
  sessionStorage.setItem('tenantMonthlyRent', String(data.monthlyRent ?? ''));
  sessionStorage.setItem('tenantEmergencyContact', data.emergencyContact || '');

  if (data.amountDue !== undefined && data.amountDue !== null) {
    sessionStorage.setItem('tenantAmountDue', String(data.amountDue));
  } else {
    sessionStorage.removeItem('tenantAmountDue');
  }
  if (data.dueDay) sessionStorage.setItem('tenantDueDay', String(data.dueDay));
  if (data.unitId) sessionStorage.setItem('tenantUnitId', data.unitId);
  if (profile.docId) sessionStorage.setItem('tenantDocId', profile.docId);
}

/**
 * Clears any tenant session left over from a previous sign-in, so a staff
 * account never inherits a tenant's cached identity.
 */
function clearTenantSession() {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith('tenant') || key === 'tenantLoggedIn') {
      sessionStorage.removeItem(key);
    }
  }
}

/**
 * Guards against concurrent routing.
 *
 * Both `onAuthStateChanged` and the submit handler can fire for a single
 * sign-in, which used to start two overlapping routeUser() runs -- two
 * competing signOut() calls and two navigations. The second usually won the
 * race and left the page sitting on the login screen with no visible error.
 */
let routing = false;

/**
 * Routes a freshly authenticated user.
 * @param {import('firebase/auth').User} user
 * @returns {Promise<boolean>} whether the user was sent somewhere
 */
async function routeUser(user) {
  if (routing) return false;
  routing = true;

  try {
    const email = user.email || '';

    const [role, profile] = await Promise.all([
      readRole(user.uid),
      loadTenantProfile(user.uid, email.toLowerCase())
    ]);

    const destination = resolveDestination({
      role,
      hasTenantProfile: Boolean(profile.docId)
    });

    if (!destination) {
      // A valid account with nowhere to go must not sit signed in.
      clearTenantSession();
      await signOut(auth);
      showError(noDestinationMessage(role));
      return false;
    }

    if (destination.includes('tenant-portal')) {
      seedTenantSession(profile, email.toLowerCase());
    } else {
      clearTenantSession();
    }

    window.location.href = destination;
    return true;
  } finally {
    routing = false;
  }
}

// Already signed in? Skip the form and go straight to the right place.
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  routeUser(user).catch((error) => console.error('Routing check failed:', error));
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const formData = new FormData(loginForm);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const remember = rememberCheckbox?.checked !== false;

  if (!email || !password) {
    showError('Please enter both email and password.');
    return;
  }

  const submitBtn = loginForm.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';
  }

  try {
    // Defaults to "remember me" (local persistence), matching how tenants were
    // previously kept signed in. Unchecking uses session persistence, which
    // suits a shared machine.
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

    const { user } = await signInWithEmailAndPassword(auth, email, password);
    await routeUser(user);
  } catch (error) {
    console.error(error);
    showError(ERROR_MESSAGES[error.code] || 'Login failed. Please check your email and password.');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  }
});
