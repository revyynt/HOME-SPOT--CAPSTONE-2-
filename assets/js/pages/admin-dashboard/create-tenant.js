/**
 * Create-tenant modal and form submission.
 *
 * The generated password is handed to Firebase Auth and shown to the admin
 * once. It is never written to Firestore -- `firestore.rules` rejects any
 * tenant document containing a `password` field.
 */

import { db, firebaseFirestore } from '../../firebase-service.js';
import {
  getApps,
  getApp,
  initializeApp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

/**
 * A dedicated Auth instance, so creating a tenant account never signs the
 * admin out of their own session.
 */
let tenantCreationAuth = null;
let initAttempted = false;

function getTenantCreationAuth() {
  if (initAttempted) return tenantCreationAuth;
  initAttempted = true;

  try {
    if (!getApps().length) return null;
    const app = initializeApp(getApp().options, 'TenantAccountCreationApp');
    tenantCreationAuth = getAuth(app);
  } catch (error) {
    console.warn('Secondary auth for tenant creation unavailable:', error);
  }
  return tenantCreationAuth;
}

const PASSWORD_WORDS = ['Home', 'Spot', 'Dorm', 'MJP', 'Stay'];

/**
 * Fills the password field with a readable temporary password.
 */
export function generateTemporaryPassword() {
  const word = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  const number = Math.floor(1000 + Math.random() * 9000);

  const input = document.getElementById('tenantPassword');
  if (input) {
    input.value = `${word}@${number}!`;
    input.type = 'text';
  }
}

export function togglePasswordVisibility() {
  const input = document.getElementById('tenantPassword');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

export function openCreateTenantModal() {
  document.getElementById('createTenantAlert')?.classList.add('hidden');
  document.getElementById('createTenantForm')?.reset();

  const moveIn = document.getElementById('tenantMoveInDate');
  if (moveIn && !moveIn.value) {
    moveIn.value = new Date().toISOString().split('T')[0];
  }

  generateTemporaryPassword();
  document.getElementById('createTenantModal')?.classList.remove('hidden');
}

export function closeCreateTenantModal() {
  document.getElementById('createTenantModal')?.classList.add('hidden');
}

/**
 * Opens the modal pre-filled from an approved reservation request.
 */
export function openCreateTenantModalFromData(data = {}) {
  openCreateTenantModal();

  const assign = (id, value) => {
    if (!value) return;
    const el = document.getElementById(id);
    if (el) el.value = value;
  };

  assign('tenantFullName', data.name);
  assign('tenantEmail', data.email);
  assign('tenantPhone', data.phone);
  assign('tenantRoom', data.room);
  assign('tenantDorm', data.dormName);
  assign('tenantMonthlyRent', data.amount);

  if (data.moveInDate) {
    const parsed = new Date(data.moveInDate);
    if (!isNaN(parsed.getTime())) {
      assign('tenantMoveInDate', parsed.toISOString().split('T')[0]);
    }
  }
}

function showFormError(message) {
  const alertBox = document.getElementById('createTenantAlert');
  if (!alertBox) return;
  alertBox.className = 'p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200';
  alertBox.textContent = message;
  alertBox.classList.remove('hidden');
}

function readForm() {
  const value = (id) => document.getElementById(id)?.value?.trim() ?? '';
  return {
    name: value('tenantFullName'),
    email: value('tenantEmail').toLowerCase(),
    password: document.getElementById('tenantPassword')?.value ?? '',
    phone: value('tenantPhone'),
    emergencyContact: value('tenantEmergency'),
    room: value('tenantRoom'),
    dormName: document.getElementById('tenantDorm')?.value ?? '',
    moveInDate: value('tenantMoveInDate'),
    monthlyRent: parseFloat(document.getElementById('tenantMonthlyRent')?.value) || 0,
    dueDay: parseInt(document.getElementById('tenantDueDay')?.value, 10) || 5,
    leaseTerm: document.getElementById('tenantLeaseTerm')?.value ?? '',
    notes: value('tenantNotes')
  };
}

/**
 * Creates the Firebase Auth account, then the Firestore profile.
 * @returns {Promise<{name: string, password: string} | null>}
 */
export async function createTenant() {
  const form = readForm();

  if (
    !form.name ||
    !form.email ||
    !form.password ||
    !form.phone ||
    !form.room ||
    !form.moveInDate ||
    !form.monthlyRent
  ) {
    showFormError('Please fill out all required fields.');
    return null;
  }
  if (form.password.length < 6) {
    showFormError('Password must be at least 6 characters.');
    return null;
  }

  const auth = getTenantCreationAuth();
  if (!auth) {
    showFormError('Account creation is unavailable. Please reload and try again.');
    return null;
  }

  let uid;
  try {
    const credential = await createUserWithEmailAndPassword(auth, form.email, form.password);
    uid = credential.user.uid;
  } catch (error) {
    // Any failure here leaves a tenant with no way to sign in, so abort
    // rather than creating an orphaned Firestore record.
    const messages = {
      'auth/email-already-in-use': 'An account already exists for that email address.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/invalid-email': 'Please enter a valid email address.'
    };
    showFormError(
      messages[error.code] || 'Could not create the sign-in account. Please try again.'
    );
    return null;
  } finally {
    await signOut(auth).catch(() => {});
  }

  // No `password` field: Firebase Auth owns the credential.
  await firebaseFirestore.addDoc(firebaseFirestore.collection(db, 'tenants'), {
    name: form.name,
    email: form.email,
    phone: form.phone,
    emergencyContact: form.emergencyContact,
    room: form.room,
    dormName: form.dormName,
    moveInDate: form.moveInDate,
    monthlyRent: form.monthlyRent,
    dueDay: form.dueDay,
    leaseTerm: form.leaseTerm,
    notes: form.notes,
    status: 'Active',
    role: 'tenant',
    uid,
    createdAt: firebaseFirestore.serverTimestamp(),
    updatedAt: firebaseFirestore.serverTimestamp()
  });

  // Lets the dashboards' auth guard read the role. firestore.rules permits an
  // admin to create this only with role 'tenant'.
  await firebaseFirestore.setDoc(
    firebaseFirestore.doc(db, 'users', uid),
    {
      name: form.name,
      email: form.email,
      role: 'tenant',
      room: form.room,
      phone: form.phone,
      dormName: form.dormName,
      createdAt: firebaseFirestore.serverTimestamp()
    },
    { merge: true }
  );

  return { name: form.name, password: form.password };
}

/**
 * Binds the create-tenant modal and form.
 */
export function initCreateTenant() {
  const form = document.getElementById('createTenantForm');
  if (!form) return;

  // Modal and helper controls, previously inline onclick attributes.
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const button = target.closest('[data-action]');
    switch (button?.dataset.action) {
      case 'open-create-tenant':
        openCreateTenantModal();
        break;
      case 'generate-password':
        generateTemporaryPassword();
        break;
      case 'toggle-password':
        togglePasswordVisibility();
        break;
      default:
        break;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitBtn = document.getElementById('submitTenantBtn');
    const spinner = document.getElementById('submitTenantSpinner');
    const submitText = document.getElementById('submitTenantText');
    const alertBox = document.getElementById('createTenantAlert');

    submitBtn.disabled = true;
    spinner?.classList.remove('hidden');
    if (submitText) submitText.textContent = 'Creating Account...';
    alertBox?.classList.add('hidden');

    try {
      const created = await createTenant();
      if (!created) return;

      // The temporary password is shown exactly once, here.
      alert(
        `Tenant account created for ${created.name}.\n\n` +
          `Temporary password: ${created.password}\n\n` +
          `Share it with the tenant now -- it is not stored anywhere and cannot be shown again.`
      );

      form.reset();
      closeCreateTenantModal();

      document.querySelector('[data-tab-button="tenants"]')?.click();
    } catch (error) {
      console.error('Tenant creation failed:', error);
      showFormError('Could not create the tenant account. Please try again.');
    } finally {
      submitBtn.disabled = false;
      spinner?.classList.add('hidden');
      if (submitText) submitText.textContent = 'Create Tenant Account';
    }
  });
}
