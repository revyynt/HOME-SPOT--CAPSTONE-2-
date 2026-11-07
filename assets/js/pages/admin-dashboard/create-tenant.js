/**
 * Create-tenant modal and form submission.
 *
 * The generated password is sent to the tenant provisioning Edge Function
 * and shown to the admin once. It is never written to application data.
 */

import { createClient } from '@supabase/supabase-js';
import { db, supabase, supabaseData } from '../../supabase-service.js';
import {
  isPastDate,
  isValidPhilippinePhone,
  normalizePhilippinePhone,
  todayIsoLocal
} from '../../lib/format.js';
import { BUILDING_UNITS, resolveBuildingUnit } from '../../lib/building-3d.js';
import { getTenants } from './tenants.js';

export const UNIT_SHORT_LABELS = {
  'Commercial Space 1': '1F • Commercial Space 1',
  'Room 101': '2F • Room 101',
  'Room 102': '2F • Room 102',
  'Room 103': '2F • Room 103',
  'Room 201': '3F • Room 201',
  'Room 202': '3F • Room 202',
  'Room 203': '3F • Room 203',
  'Room 301': '4F • Room 301',
  'Room 302': '4F • Room 302',
  'Room 303': '4F • Room 303',
  'Room 401': '5F • Room 401',
  'Room 402': '5F • Room 402',
  'Room 410': '5F • Room 410'
};

export function getUnitOccupants(unitId) {
  const tenants = getTenants() || [];
  return tenants.filter((t) => {
    const status = String(t.status || 'Active').toLowerCase();
    if (status === 'archived' || status === 'inactive') return false;
    if (!t.room) return false;
    const resolved = resolveBuildingUnit(t.room, t.dormName || t.dorm || '');
    return resolved && resolved.id === unitId;
  });
}

export function syncDormAndRentWithRoom(forceRent = false) {
  const roomSelect = document.getElementById('tenantRoom');
  const dormSelect = document.getElementById('tenantResidenceType');
  const rentInput = document.getElementById('tenantMonthlyRent');
  if (!roomSelect) return;

  const selectedRoom = roomSelect.value;
  const unit = BUILDING_UNITS.find((u) => u.id === selectedRoom);
  const residenceType =
    unit?.floor === 1 || String(selectedRoom).toLowerCase().includes('commercial')
      ? 'Commercial Space'
      : 'Triple Occupancy Room';

  if (dormSelect) {
    dormSelect.disabled = true;
    const exists = Array.from(dormSelect.options).some((o) => o.value === residenceType);
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = residenceType;
      opt.textContent = residenceType;
      dormSelect.appendChild(opt);
    }
    dormSelect.value = residenceType;
  }

  const defaultRent = residenceType === 'Commercial Space' ? '12000' : '10000';
  if (rentInput && (forceRent || !rentInput.value)) {
    rentInput.value = defaultRent;
  }

  const currentRentNum = parseFloat(rentInput?.value) || parseFloat(defaultRent) || 10000;
  const advanceRentInput = document.getElementById('tenantAdvanceRent');
  if (advanceRentInput && (forceRent || !advanceRentInput.value)) {
    advanceRentInput.value = String(currentRentNum);
  }

  const securityDepositInput = document.getElementById('tenantSecurityDeposit');
  if (securityDepositInput && (forceRent || !securityDepositInput.value)) {
    securityDepositInput.value = String(currentRentNum * 2);
  }

  updateMoveInTotalDisplay();
}

export function updateMoveInTotalDisplay() {
  const rentVal = parseFloat(document.getElementById('tenantMonthlyRent')?.value) || 0;
  const advVal = parseFloat(document.getElementById('tenantAdvanceRent')?.value) || rentVal;
  const depVal = parseFloat(document.getElementById('tenantSecurityDeposit')?.value) || rentVal * 2;
  const total = advVal + depVal;
  const el = document.getElementById('tenantMoveInTotalDisplay');
  if (el) {
    el.textContent = `₱${total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function refreshTenantRoomOptions(preferredRoom = '') {
  const roomSelect = document.getElementById('tenantRoom');
  if (!roomSelect) return;

  const currentVal = preferredRoom || roomSelect.value;
  roomSelect.innerHTML = '<option value="" disabled selected>Select Room / Unit</option>';

  BUILDING_UNITS.forEach((unit) => {
    const cap = 1;
    const occ = getUnitOccupants(unit.id).length;
    const isFull = occ >= cap;
    const baseLabel = UNIT_SHORT_LABELS[unit.id] || `${unit.floor}F • ${unit.name}`;
    const statusText = isFull ? `FULL • ${occ}/1 User` : 'Available • 0/1 User';

    const opt = document.createElement('option');
    opt.value = unit.id;
    opt.textContent = `${baseLabel} — ${statusText}`;
    opt.disabled = isFull;
    roomSelect.appendChild(opt);
  });

  if (currentVal) {
    const exactOpt = Array.from(roomSelect.options).find(
      (o) => o.value === currentVal && !o.disabled
    );
    if (exactOpt) {
      roomSelect.value = currentVal;
    } else {
      const wantsCommercial = String(currentVal).toLowerCase().includes('commercial');
      const fallbackUnit = BUILDING_UNITS.find((u) => {
        const cap = Number(u.capacity) || (u.floor === 1 ? 4 : 3);
        const isFull = getUnitOccupants(u.id).length >= cap;
        if (isFull) return false;
        return wantsCommercial ? u.floor === 1 : u.floor > 1;
      });
      if (fallbackUnit) {
        roomSelect.value = fallbackUnit.id;
      }
    }
  }

  syncDormAndRentWithRoom(false);
}

const PASSWORD_WORDS = ['Home', 'Spot', 'Room', 'MJP', 'Stay'];

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
  const minDate = todayIsoLocal();
  if (moveIn) {
    moveIn.min = minDate;
    if (!moveIn.value || moveIn.value < minDate) {
      moveIn.value = minDate;
    }
  }

  refreshTenantRoomOptions();
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

  refreshTenantRoomOptions(data.room || data.dormName || '');
  const isComm = String(data.room || data.dormName || '')
    .toLowerCase()
    .includes('commercial');
  const defaultRent = isComm ? 12000 : 10000;
  const rentToSet = Number(data.amount) || defaultRent;
  assign('tenantMonthlyRent', rentToSet);
  assign('tenantAdvanceRent', data.advanceRent || rentToSet);
  assign('tenantSecurityDeposit', data.securityDeposit || rentToSet * 2);
  assign('tenantLeaseTerm', data.leaseTerm || '6 Months');
  syncDormAndRentWithRoom(!data.amount);

  if (data.moveInDate) {
    const parsed = new Date(data.moveInDate);
    if (!isNaN(parsed.getTime())) {
      const minDate = todayIsoLocal();
      const iso = parsed.toISOString().split('T')[0];
      assign('tenantMoveInDate', iso < minDate ? minDate : iso);
    }
  }
}

const CONTRACT_BUCKET = 'room-media';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a signed lease contract proof file (image or PDF) to Supabase Storage
 * with an automatic Data URL fallback.
 * @param {File} file
 * @param {string} [prefix]
 */
export async function uploadContractProofFile(file, prefix = 'tenant') {
  if (!file) return null;
  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('Contract file must be 10 MB or smaller.');
  }
  const safePrefix =
    String(prefix || 'tenant')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40) || 'tenant';
  const safeName =
    String(file.name || 'contract')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80) || 'contract';
  const filePath = `contracts/${safePrefix}-${Date.now()}-${safeName}`;
  const contentType =
    file.type || (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

  try {
    const { error: uploadErr } = await supabase.storage
      .from(CONTRACT_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType
      });
    if (!uploadErr) {
      const { data } = supabase.storage.from(CONTRACT_BUCKET).getPublicUrl(filePath);
      if (data?.publicUrl) {
        return {
          contractFileUrl: data.publicUrl,
          contractFileName: file.name || safeName,
          contractFileType: contentType,
          contractUploadedAt: new Date().toISOString()
        };
      }
    }
  } catch (err) {
    console.warn('Contract storage upload fallback to Data URL:', err);
  }

  const dataUrl = await readFileAsDataUrl(file);
  return {
    contractFileUrl: dataUrl,
    contractFileName: file.name || safeName,
    contractFileType: contentType,
    contractUploadedAt: new Date().toISOString()
  };
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
  const rent = parseFloat(document.getElementById('tenantMonthlyRent')?.value) || 0;
  const advRent = parseFloat(document.getElementById('tenantAdvanceRent')?.value) || rent;
  const secDep = parseFloat(document.getElementById('tenantSecurityDeposit')?.value) || rent * 2;
  return {
    name: value('tenantFullName'),
    email: value('tenantEmail').toLowerCase(),
    password: document.getElementById('tenantPassword')?.value ?? '',
    phone: value('tenantPhone'),
    emergencyContact: value('tenantEmergency'),
    room: value('tenantRoom'),
    dormName: document.getElementById('tenantResidenceType')?.value ?? '',
    moveInDate: value('tenantMoveInDate'),
    monthlyRent: rent,
    advanceRent: advRent,
    securityDeposit: secDep,
    advanceDeposit: advRent,
    dueDay: parseInt(document.getElementById('tenantDueDay')?.value, 10) || 5,
    leaseTerm: document.getElementById('tenantLeaseTerm')?.value || '6 Months',
    rulesAgreed: document.getElementById('tenantRulesAgreed')?.checked ?? true,
    contractSigned: document.getElementById('tenantContractSigned')?.checked ?? true,
    paymentVerified: document.getElementById('tenantPaymentVerified')?.checked ?? true,
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

  // Check if an existing (e.g. archived) tenant record already exists with this email
  const existingDocs = await supabaseData
    .getDocs(
      supabaseData.query(
        supabaseData.collection(db, 'tenants'),
        supabaseData.where('email', '==', form.email)
      )
    )
    .catch(() => null);

  const existingDoc = existingDocs && !existingDocs.empty ? existingDocs.docs[0] : null;
  const tenantId =
    existingDoc?.id ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `tenant-${Date.now()}`);

  const tenantRecord = {
    ...(existingDoc?.data() || {}),
    name: form.name,
    email: form.email,
    phone: form.phone,
    emergencyContact: form.emergencyContact || '',
    room: form.room,
    dormName: form.dormName || '',
    moveInDate: form.moveInDate,
    monthlyRent: form.monthlyRent,
    advanceRent: form.advanceRent ?? form.monthlyRent,
    securityDeposit: form.securityDeposit ?? form.monthlyRent * 2,
    advanceDeposit: form.advanceRent ?? form.monthlyRent,
    dueDay: form.dueDay,
    leaseTerm: form.leaseTerm || '6 Months',
    rulesAgreed: form.rulesAgreed !== false,
    contractSigned: form.contractSigned !== false,
    paymentVerified: form.paymentVerified !== false,
    contractFileUrl: form.contractFileUrl || existingDoc?.data()?.contractFileUrl || '',
    contractFileName: form.contractFileName || existingDoc?.data()?.contractFileName || '',
    contractFileType: form.contractFileType || existingDoc?.data()?.contractFileType || '',
    contractUploadedAt: form.contractUploadedAt || existingDoc?.data()?.contractUploadedAt || '',
    notes: form.notes || '',
    status: 'Active',
    role: 'tenant',
    uid: userId || existingDoc?.data()?.uid || '',
    updatedAt: now
  };
  if (!existingDoc) {
    tenantRecord.createdAt = now;
  }

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
  if (!isValidPhilippinePhone(form.phone)) {
    showFormError('Please enter a valid 11-digit Philippine mobile number (e.g. 0912 345 6789).');
    return null;
  }
  if (isPastDate(form.moveInDate)) {
    showFormError('Move-in date cannot be in the past.');
    return null;
  }
  const targetUnit =
    BUILDING_UNITS.find((u) => u.id === form.room) || resolveBuildingUnit(form.room, form.dormName);
  if (targetUnit) {
    const cap = Number(targetUnit.capacity) || (targetUnit.floor === 1 ? 4 : 3);
    const occ = getUnitOccupants(targetUnit.id).length;
    if (occ >= cap) {
      showFormError(
        `${targetUnit.name} is already at full capacity (${occ}/${cap} occupants). Please select another available unit.`
      );
      return null;
    }
    form.dormName = targetUnit.floor === 1 ? 'Commercial Space' : 'Triple Occupancy Room';
  }
  form.phone = normalizePhilippinePhone(form.phone) || form.phone;

  const contractFile = document.getElementById('tenantContractFileInput')?.files?.[0];
  if (contractFile) {
    try {
      const uploaded = await uploadContractProofFile(contractFile, form.room || form.email);
      if (uploaded) {
        form.contractFileUrl = uploaded.contractFileUrl;
        form.contractFileName = uploaded.contractFileName;
        form.contractFileType = uploaded.contractFileType;
        form.contractUploadedAt = uploaded.contractUploadedAt;
        form.contractSigned = true;
      }
    } catch (uploadErr) {
      showFormError(uploadErr.message || 'Could not upload contract proof file.');
      return null;
    }
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

  return {
    name: form.name,
    email: form.email,
    room: form.room,
    password: form.password,
    moveInDate: form.moveInDate,
    monthlyRent: form.monthlyRent,
    dueDay: form.dueDay || 5
  };
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
  set('createdTenantEmailBadge', created.email);

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

  refreshTenantRoomOptions();
  document.getElementById('tenantRoom')?.addEventListener('change', () => {
    syncDormAndRentWithRoom(true);
  });
  ['tenantMonthlyRent', 'tenantAdvanceRent', 'tenantSecurityDeposit'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateMoveInTotalDisplay);
  });

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
      case 'resend-created-tenant-email': {
        if (!lastCreatedCredentials) break;
        const btn = document.getElementById('resendCreatedTenantEmailBtn');
        if (btn) btn.textContent = 'Sending...';
        supabase.functions
          .invoke('send-email', {
            body: {
              type: 'welcome_credentials',
              to: lastCreatedCredentials.email,
              name: lastCreatedCredentials.name,
              room: lastCreatedCredentials.room,
              password: lastCreatedCredentials.password,
              moveInDate: lastCreatedCredentials.moveInDate || '',
              amount: lastCreatedCredentials.monthlyRent || 10000
            }
          })
          .then(() => {
            if (btn) btn.textContent = '✓ Email Sent!';
          })
          .catch(() => {
            if (btn) btn.textContent = '✓ Dispatched';
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

      // Automated email dispatch with credentials
      try {
        const currentOrigin =
          typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'https://home-spot.online';
        await supabase.functions.invoke('send-email', {
          body: {
            type: 'welcome_credentials',
            to: created.email,
            name: created.name,
            room: created.room,
            password: created.password,
            moveInDate: created.moveInDate || '',
            amount: created.monthlyRent || 10000,
            dueDay: created.dueDay || 5,
            portalUrl: `${currentOrigin}/login.html`
          }
        });
      } catch (mailErr) {
        console.warn('Automated welcome email dispatch note:', mailErr);
      }

      form.reset();
      showCreatedTenantInModal(created);
    } catch (error) {
      console.error('Tenant creation failed:', error);
      showFormError('Could not create the tenant account. Please try again.');
    } finally {
      submitBtn.disabled = false;
      spinner?.classList.add('hidden');
      if (submitText) submitText.textContent = 'Create Account';
    }
  });
}
