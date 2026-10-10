/**
 * Admin / super-admin sign-in.
 *
 * Previously carried its own copy of the Firebase config, which had silently
 * diverged from the canonical one (different `storageBucket`, plus a stray
 * `measurementId`). It now imports the shared instances from
 * firebase-service.js.
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

/** Where each role lands after signing in. */
const ROLE_DESTINATIONS = {
  superadmin: './super-admin-dashboard.html',
  admin: './admin-dashboard.html'
};

/** Friendly copy for the auth error codes users actually hit. */
const ERROR_MESSAGES = {
  'auth/invalid-email': 'Invalid email address.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-disabled': 'This user has been disabled.',
  'auth/user-not-found': 'No account found with these credentials.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/too-many-requests': 'Too many attempts. Try again later.'
};

/**
 * @param {string} uid
 * @returns {Promise<string|null>}
 */
async function readRole(uid) {
  const snap = await firebaseFirestore.getDoc(firebaseFirestore.doc(db, 'users', uid));
  return snap.exists() ? snap.data().role : null;
}

function redirectForRole(role) {
  const destination = ROLE_DESTINATIONS[role];
  if (destination) {
    window.location.href = destination;
    return true;
  }
  return false;
}

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

// Already signed in? Skip the form and go straight to the right dashboard.
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    redirectForRole(await readRole(user.uid));
  } catch (error) {
    console.error('Error checking user role:', error);
  }
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const formData = new FormData(loginForm);
  const email = formData.get('email');
  const password = formData.get('password');
  const remember = Boolean(rememberCheckbox?.checked);

  if (!email || !password) {
    showError('Please enter both email and password.');
    return;
  }

  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

    const { user } = await signInWithEmailAndPassword(auth, email, password);
    const role = await readRole(user.uid);

    if (!redirectForRole(role)) {
      // A valid account with no staff role must not reach a dashboard.
      await signOut(auth);
      showError('Your account does not have a role assigned. Please contact support.');
    }
  } catch (error) {
    console.error(error);
    showError(ERROR_MESSAGES[error.code] || 'Login failed. Please check your email and password.');
  }
});
