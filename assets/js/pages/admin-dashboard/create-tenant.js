/**
 * Create-tenant modal and form submission.
 *
 * The generated password is sent to the tenant provisioning Edge Function
 * and shown to the admin once. It is never written to application data.
 */

import { supabase } from '../../supabase-service.js';

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
 * Creates a tenant through the role-checked Supabase Edge Function.
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
    if (error) throw error;
    if (!data?.userId) throw new Error(data?.error || 'Tenant account creation failed.');
  } catch (error) {
    console.error('Supabase tenant creation failed:', error);
    showFormError(error.message || 'Could not create the sign-in account. Please try again.');
    return null;
  }

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
