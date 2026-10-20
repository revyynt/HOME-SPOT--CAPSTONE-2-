/**
 * Create-tenant modal and form submission.
 *
 * The generated password is sent to the tenant provisioning Edge Function
 * and shown to the admin once. It is never written to application data.
 */

import { createClient } from '@supabase/supabase-js';
import { db, supabase, supabaseData } from '../../supabase-service.js';

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

let lastCreatedCredentials = null;

export function openCreateTenantModal() {
  document.getElementById('createTenantAlert')?.classList.add('hidden');
  document.getElementById('createTenantSuccess')?.classList.add('hidden');
  const form = document.getElementById('createTenantForm');
  form?.classList.remove('hidden');
  form?.reset();

  const moveIn = document.getElementById('tenantMoveInDate');
  if (moveIn && !moveIn.value) {
    moveIn.value = new Date().toISOString().split('T')[0];
  }

  generateTemporaryPassword();
  document.getElementById('createTenantModal')?.classList.remove('hidden');
}

export function closeCreateTenantModal() {
  document.getElementById('createTenantModal')?.classList.add('hidden');
  document.getElementById('createTenantSuccess')?.classList.add('hidden');
  document.getElementById('createTenantForm')?.classList.remove('hidden');
  lastCreatedCredentials = null;
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

async function extractEdgeFunctionError(error) {
  if (!error) return '';
  try {
    if (error.context && typeof error.context.json === 'function') {
      const payload = await error.context.json();
      if (payload?.error) return String(payload.error);
      if (payload?.message) return String(payload.message);
    }
  } catch {
    // Ignore JSON parse failures on non-JSON error responses
  }
  return error.message || '';
}

async function createTenantClientFallback(form) {
  const sbUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
  const sbKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!sbUrl || !sbKey) throw new Error('Supabase configuration is missing.');

  // Isolated non-persisting client so the Admin session is never overwritten
  const tempClient = createClient(sbUrl, sbKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `sb-temp-tenant-${Date.now()}`
    }
  });

  let userId = null;
  const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({
    email: form.email,
    password: form.password,
    options: {
      data: {
        role: 'tenant',
        name: form.name,
        room: form.room
      }
    }
  });

  if (signUpError) {
    const msg = String(signUpError.message || '').toLowerCase();
    if (!msg.includes('already registered') && !msg.includes('already exists')) {
      throw signUpError;
    }
  } else {
    userId = signUpData?.user?.id || null;
  }

  const now = new Date().toISOString();
  const tenantId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tenant-${Date.now()}`;

  const tenantRecord = {
    name: form.name,
    email: form.email,
    phone: form.phone,
    emergencyContact: form.emergencyContact || '',
    room: form.room,
    dormName: form.dormName || '',
    moveInDate: form.moveInDate,
    monthlyRent: form.monthlyRent,
    dueDay: form.dueDay,
    leaseTerm: form.leaseTerm || '',
    notes: form.notes || '',
    status: 'Active',
    role: 'tenant',
    uid: userId || '',
    createdAt: now,
    updatedAt: now
  };

  await supabaseData.setDoc(supabaseData.doc(db, 'tenants', tenantId), tenantRecord);
  return { userId: userId || tenantId };
}

/**
 * Creates a tenant through the role-checked Supabase Edge Function,
 * with automatic error unpacking and client-side provisioning fallback.
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

  try {
    const { data, error } = await supabase.functions.invoke('create-tenant', {
      body: form
    });
    if (error) {
      const detailedMsg = await extractEdgeFunctionError(error);
      throw new Error(detailedMsg || error.message);
    }
    if (!data?.userId) throw new Error(data?.error || 'Tenant account creation failed.');
  } catch (edgeError) {
    console.warn('Edge Function create-tenant error, attempting direct fallback:', edgeError);
    try {
      await createTenantClientFallback(form);
    } catch (fallbackError) {
      console.error('Supabase tenant creation failed:', fallbackError);
      const displayMsg =
        edgeError?.message && !edgeError.message.includes('non-2xx')
          ? edgeError.message
          : fallbackError.message || 'Could not create the sign-in account. Please try again.';
      showFormError(displayMsg);
      return null;
    }
  }

  return { name: form.name, email: form.email, room: form.room, password: form.password };
}

function showCreatedTenantInModal(created) {
  lastCreatedCredentials = created;
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };
  set('createdTenantNameLabel', created.name);
  set('createdTenantEmailValue', created.email);
  set('createdTenantPasswordValue', created.password);

  const copyBtn = document.getElementById('copyCreatedTenantBtn');
  if (copyBtn) copyBtn.textContent = 'Copy Login & Password';

  document.getElementById('createTenantForm')?.classList.add('hidden');
  document.getElementById('createTenantSuccess')?.classList.remove('hidden');
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
      case 'copy-created-tenant-password': {
        if (!lastCreatedCredentials) break;
        const text =
          `MJP Residences - Tenant Portal Access\n` +
          `Tenant: ${lastCreatedCredentials.name}\n` +
          `Email: ${lastCreatedCredentials.email}\n` +
          `Temporary Password: ${lastCreatedCredentials.password}`;
        navigator.clipboard?.writeText(text).then(() => {
          const copyBtn = document.getElementById('copyCreatedTenantBtn');
          if (copyBtn) copyBtn.textContent = '✓ Copied!';
        });
        break;
      }
      case 'finish-create-tenant':
        closeCreateTenantModal();
        document.querySelector('[data-tab-button="tenants"]')?.click();
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

      form.reset();
      showCreatedTenantInModal(created);
    } catch (error) {
      console.error('Tenant creation failed:', error);
      showFormError('Could not create the tenant account. Please try again.');
    } finally {
      submitBtn.disabled = false;
      spinner?.classList.add('hidden');
      if (submitText) submitText.textContent = 'Create Account & Save to Supabase';
    }
  });
}
