// Firebase Service - single source of truth for Firestore access.
//
// This file is loaded as a native ES module (type="module"), so it can use
// import/export. The page scripts (main.js, property-detail.js) are classic
// scripts and CANNOT import from here, so the shared helpers are also exposed
// on `window.firebaseService` for them to consume lazily at call time.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  getDocs,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  getAuth,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDfsx3AhGY9YSs73ng2t4s8-Nm76_kQewM',
  authDomain: 'capstoneapt-b5681.firebaseapp.com',
  projectId: 'capstoneapt-b5681',
  storageBucket: 'capstoneapt-b5681.appspot.com',
  messagingSenderId: '192229736140',
  appId: '1:192229736140:web:20d0e4e603d6ca98dd4c69'
};

/**
 * Optional local override, so you can point the whole app at your own Firebase
 * project without editing (or accidentally committing) this file.
 *
 * Create `assets/js/firebase-config.local.js` containing:
 *
 *   export default {
 *     apiKey: 'AIza...',
 *     authDomain: 'your-project.firebaseapp.com',
 *     projectId: 'your-project',
 *     storageBucket: 'your-project.appspot.com',
 *     messagingSenderId: '...',
 *     appId: '1:...'
 *   };
 *
 * That file is gitignored. When it is absent this import rejects and the
 * built-in config above is used unchanged, so the committed tree stays pointed
 * at the real project.
 *
 * An unfilled-in copy of the template is ignored rather than honoured: a
 * placeholder projectId would otherwise silently point the whole app at a
 * project that does not exist.
 */
function usableOverride(config) {
  const projectId = String(config?.projectId ?? '').trim();
  if (!projectId) return false;
  if (/^REPLACE/i.test(projectId)) {
    console.warn(
      '[firebase] firebase-config.local.js still has its placeholder values -- ignoring it.'
    );
    return false;
  }
  return true;
}

let activeConfig = firebaseConfig;
try {
  const override = await import('./firebase-config.local.js');
  if (usableOverride(override?.default)) {
    activeConfig = { ...firebaseConfig, ...override.default };
    console.info(`[firebase] Using local override -> project "${activeConfig.projectId}"`);
  }
} catch {
  // No override file. Expected in a normal checkout.
}

const app = initializeApp(activeConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const firebaseFirestore = {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  getDocs,
  // Exposed so reservation approval can read-then-write atomically (see
  // render/reservations.js). Firestore serializes and retries the transaction
  // server-side, which is what makes approval exactly-once.
  runTransaction,
  serverTimestamp
};

// Resolve the live Firebase handles. Falls back to this module's own
// instances so the helpers work even before the window globals are read.
function resolveHandles() {
  return {
    db: (typeof window !== 'undefined' && window.firebaseDb) || db,
    api: (typeof window !== 'undefined' && window.firebaseFirestore) || firebaseFirestore
  };
}

function isFirestoreReady() {
  const handles = resolveHandles();
  return !!(handles.db && handles.api);
}

// Convert a room display name into its Firestore document id.
function normalizeRoomDocId(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function getRoomDocRef(roomName) {
  if (!roomName || !isFirestoreReady()) return null;
  const handles = resolveHandles();
  return handles.api.doc(handles.db, 'rooms', normalizeRoomDocId(roomName));
}

function getReservationsRef() {
  if (!isFirestoreReady()) return null;
  const handles = resolveHandles();
  return handles.api.collection(handles.db, 'reservations');
}

function getMessagesRef() {
  if (!isFirestoreReady()) return null;
  const handles = resolveHandles();
  return handles.api.collection(handles.db, 'messages');
}

// Create the room document on first write so readers always find a value.
async function ensureRoomDocument(room) {
  if (!room || !isFirestoreReady()) return null;

  const roomRef = getRoomDocRef(room.name);
  if (!roomRef) return null;

  const { api } = resolveHandles();
  const roomSnap = await api.getDoc(roomRef);
  if (!roomSnap.exists()) {
    await api.setDoc(roomRef, {
      name: room.name,
      available: room.available
    });
  }

  return roomRef;
}

// Resolve true once Firebase is live, false if it never initializes.
function waitForFirebaseReady(timeout = 5000) {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.firebaseReady) {
      resolve(true);
      return;
    }

    const onReady = () => {
      clearTimeout(timer);
      resolve(true);
    };

    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('firebase-ready', onReady);
      }
      resolve(false);
    }, timeout);

    if (typeof window !== 'undefined') {
      window.addEventListener('firebase-ready', onReady, { once: true });
    } else {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

const firebaseService = {
  auth,
  isFirestoreReady,
  normalizeRoomDocId,
  getRoomDocRef,
  getReservationsRef,
  getMessagesRef,
  ensureRoomDocument,
  waitForFirebaseReady,
  getCurrentUser,
  getIdToken,
  requireRole
};

// Track the signed-in user so callers (e.g. the PayMongo bridge) can attach a
// verifiable ID token to privileged requests.
let currentUser = auth.currentUser;
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  window.dispatchEvent(new CustomEvent('firebase-auth-changed', { detail: { user } }));
});

/**
 * The currently signed-in user, or null.
 *
 * `auth.currentUser` is null until the SDK has restored its persisted session,
 * so await `authReady` before relying on this.
 *
 * @returns {import('firebase/auth').User|null}
 */
function getCurrentUser() {
  return currentUser;
}

/**
 * Resolves once Firebase has restored (or rejected) the persisted session.
 * Use this before any auth guard -- `auth.currentUser` is null until the SDK
 * has finished reading its IndexedDB-backed session.
 */
const authReady = new Promise((resolve) => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    resolve(user);
  });
});
firebaseService.authReady = authReady;

/**
 * Returns a fresh Firebase ID token, or null when nobody is signed in.
 * The PayMongo API server rejects any /api/* call without one.
 */
async function getIdToken(forceRefresh = false) {
  const user = getCurrentUser();
  if (!user) return null;
  try {
    return await user.getIdToken(forceRefresh);
  } catch (err) {
    console.warn('[firebase] failed to obtain ID token:', err.message);
    return null;
  }
}

/**
 * Whether a user's role satisfies a page requirement.
 *
 * Roles are hierarchical, mirroring firestore.rules:
 *   isAdmin()      -> ['admin', 'superadmin']
 *   isSuperAdmin() -> 'superadmin'
 * A superadmin therefore satisfies an 'admin' requirement. The guard used to
 * compare with `!==`, which bounced a superadmin off admin-dashboard.html even
 * though the rules let them read and write everything in it.
 *
 * @param {string|null} role
 * @param {'admin'|'superadmin'} requiredRole
 * @returns {boolean}
 */
function roleSatisfies(role, requiredRole) {
  if (role == null) return false;
  if (requiredRole === 'superadmin') return role === 'superadmin';
  if (requiredRole === 'admin') return role === 'admin' || role === 'superadmin';
  return role === requiredRole;
}

/**
 * Guards a page behind an authentication + role requirement.
 * Redirects and returns false when the requirement is not met.
 *
 * @param {'admin'|'superadmin'} requiredRole
 * @param {string} [redirectTo]
 */
async function requireRole(requiredRole, redirectTo) {
  await authReady;

  const user = getCurrentUser();
  if (!user) {
    window.location.replace(redirectTo || 'admin-login.html');
    return false;
  }

  let role;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    role = snap.exists() ? snap.data().role : null;
  } catch (err) {
    console.error('[auth] role lookup failed:', err);
    window.location.replace(redirectTo || 'admin-login.html');
    return false;
  }

  if (!roleSatisfies(role, requiredRole)) {
    console.warn(`[auth] role mismatch: required ${requiredRole}, found ${role}`);
    window.location.replace(redirectTo || 'admin-login.html');
    return false;
  }

  return true;
}

// Legacy globals consumed directly by the classic scripts.
window.firebaseDb = db;
window.firebaseFirestore = firebaseFirestore;
window.firebaseAuth = auth;
window.firebaseCurrentUser = auth.currentUser;
window.firebaseReady = true;
window.firebaseReadyPromise = authReady.then(() => true);
window.firebaseService = firebaseService;
window.dispatchEvent(new Event('firebase-ready'));

export {
  app,
  auth,
  authReady,
  db,
  firebaseFirestore,
  firebaseService,
  isFirestoreReady,
  normalizeRoomDocId,
  getRoomDocRef,
  getReservationsRef,
  getMessagesRef,
  ensureRoomDocument,
  waitForFirebaseReady,
  getCurrentUser,
  getIdToken,
  requireRole
};
