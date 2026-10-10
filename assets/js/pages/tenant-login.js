/**
 * Tenant sign-in.
 *
 * Extracted from a 161-line inline script that carried its own copy of the
 * Firebase config. It now imports the shared instances from firebase-service.js.
 *
 * Sign-in is verified by Firebase Auth only -- there is no plaintext-password
 * fallback, and no password is stored in Firestore.
 */

import { auth, db, firebaseFirestore } from '../firebase-service.js';
import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const ERROR_MESSAGES = {
  'auth/invalid-credential': 'Account not found or password incorrect.',
  'auth/wrong-password': 'Account not found or password incorrect.',
  'auth/user-not-found': 'Account not found or password incorrect.',
  'auth/too-many-requests': 'Too many failed attempts. Please wait a moment.'
};

const signupModal = document.getElementById('signupModal');
const alertBox = document.getElementById('loginAlert');

function showAlert(message, isSuccess = false) {
  if (!alertBox) return;
  alertBox.style.display = 'block';
  if (isSuccess) {
    alertBox.style.background = '#ecfdf5';
    alertBox.style.color = '#065f46';
    alertBox.style.border = '1px solid #a7f3d0';
  } else {
    alertBox.style.background = '#fef2f2';
    alertBox.style.color = '#991b1b';
    alertBox.style.border = '1px solid #fecaca';
  }
  // textContent, not innerHTML: the message is shown to the user verbatim.
  alertBox.textContent = message;
}

function clearAlert() {
  if (!alertBox) return;
  alertBox.style.display = 'none';
  alertBox.textContent = '';
}

/** Loads the tenant profile. firestore.rules scopes this read to the signer. */
async function loadProfile(uid, email) {
  try {
    const query = firebaseFirestore.query(
      firebaseFirestore.collection(db, 'tenants'),
      firebaseFirestore.where('email', '==', email)
    );
    const snapshot = await firebaseFirestore.getDocs(query);
    if (snapshot.empty) return { data: {}, docId: null };
    return { data: snapshot.docs[0].data(), docId: snapshot.docs[0].id };
  } catch (error) {
    // A missing profile is not a login failure.
    console.warn('Tenant profile lookup failed:', error);
    return { data: {}, docId: null };
  }
}

function seedSession({ data, docId }, email) {
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
  if (docId) sessionStorage.setItem('tenantDocId', docId);
}

// --- Page controls ----------------------------------------------------------
// Delegated: module scope is not visible to inline onclick attributes.
document.addEventListener('click', (event) => {
  const trigger = event.target instanceof Element ? event.target.closest('[data-action]') : null;
  if (!trigger) return;

  switch (trigger.dataset.action) {
    case 'close-signup-modal':
      event.preventDefault();
      if (signupModal) signupModal.style.display = 'none';
      break;
    case 'contact-admin':
      event.preventDefault();
      alert(
        'Please contact the building administrator or front desk to reset your tenant password.'
      );
      break;
    default:
      break;
  }
});

// --- Signup modal -----------------------------------------------------------
document.getElementById('signupLink')?.addEventListener('click', (event) => {
  event.preventDefault();
  if (signupModal) signupModal.style.display = 'flex';
});

document.querySelector('.close-modal')?.addEventListener('click', () => {
  if (signupModal) signupModal.style.display = 'none';
});

signupModal?.addEventListener('click', (event) => {
  if (event.target === signupModal) signupModal.style.display = 'none';
});

// --- Sign-in ----------------------------------------------------------------
document.getElementById('tenantLoginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlert();

  const email = document.getElementById('email')?.value.trim().toLowerCase() ?? '';
  const password = document.getElementById('password')?.value ?? '';
  const submitBtn = document.getElementById('loginSubmitBtn');

  if (!email || !password) {
    showAlert('Please enter both your email address and password.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying Credentials...';
  submitBtn.style.opacity = '0.7';

  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    const signedInEmail = user.email || email;

    const profile = await loadProfile(user.uid, signedInEmail);
    seedSession(profile, signedInEmail);

    showAlert('Login successful! Redirecting to your Tenant Portal...', true);
    setTimeout(() => {
      window.location.href = 'tenant-portal.html';
    }, 600);
  } catch (error) {
    showAlert(
      ERROR_MESSAGES[error.code] ??
        'Login error: ' + (error.message || 'Please check your connection and try again.')
    );
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
    submitBtn.style.opacity = '1';
  }
});
