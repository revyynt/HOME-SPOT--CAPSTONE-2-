import { db, setPersistence, supabase, supabaseData } from '../supabase-service.js';

const ROLE_DESTINATIONS = {
  superadmin: './super-admin-dashboard.html',
  admin: './admin-dashboard.html',
  tenant: './tenant-portal.html'
};

const ERROR_MESSAGES = {
  invalid_credentials: 'Account not found or password incorrect.',
  user_not_found: 'Account not found or password incorrect.',
  invalid_email: 'Please enter a valid email address.',
  user_banned: 'This account has been disabled.',
  over_request_rate_limit: 'Too many failed attempts. Please wait a moment.'
};

const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const rememberMeCheckbox = document.getElementById('rememberMe');
const loginSubmitBtn = document.getElementById('loginSubmitBtn');
const loginAlert = document.getElementById('loginAlert');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const eyeIcon = document.getElementById('eyeIcon');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const signupLink = document.getElementById('signupLink');
const signupModal = document.getElementById('signupModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const understoodBtn = document.getElementById('understoodBtn');

let isSubmitting = false;

function showAlert(message, isSuccess = false) {
  if (!loginAlert) return;
  loginAlert.classList.remove('hidden');
  if (isSuccess) {
    loginAlert.className =
      'mb-6 p-4 rounded-xl text-sm leading-relaxed border bg-emerald-50 text-emerald-800 border-emerald-200';
  } else {
    loginAlert.className =
      'mb-6 p-4 rounded-xl text-sm leading-relaxed border bg-red-50 text-red-800 border-red-200';
  }
  loginAlert.textContent = message;
}

function clearAlert() {
  if (!loginAlert) return;
  loginAlert.classList.add('hidden');
  loginAlert.textContent = '';
}

async function loadProfile(uid) {
  const snapshot = await supabaseData.getDocs(
    supabaseData.query(supabaseData.collection(db, 'tenants'), supabaseData.where('uid', '==', uid))
  );
  if (snapshot.empty) return { data: {}, docId: null };
  return { data: snapshot.docs[0].data(), docId: snapshot.docs[0].id };
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

async function routeUser(user, fallbackEmail) {
  const role = user?.app_metadata?.role;
  const destination = ROLE_DESTINATIONS[role];

  if (!destination) {
    await supabase.auth.signOut();
    throw new Error(
      'Your account does not have a portal role assigned. Please contact management.'
    );
  }

  if (role === 'tenant') {
    const profile = await loadProfile(user.id);
    seedSession(profile, user.email || fallbackEmail);
  }

  window.location.href = destination;
}

// Password visibility toggle
togglePasswordBtn?.addEventListener('click', () => {
  if (!passwordInput) return;
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';

  if (eyeIcon) {
    eyeIcon.innerHTML = isPassword
      ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />`
      : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />`;
  }
});

// Forgot password action
forgotPasswordBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  alert('Please contact the building administrator or front desk to reset your portal password.');
});

// Modal open / close
function openModal() {
  if (signupModal) signupModal.style.display = 'flex';
}
function closeModal() {
  if (signupModal) signupModal.style.display = 'none';
}

signupLink?.addEventListener('click', (e) => {
  e.preventDefault();
  openModal();
});
closeModalBtn?.addEventListener('click', closeModal);
understoodBtn?.addEventListener('click', closeModal);
signupModal?.addEventListener('click', (e) => {
  if (e.target === signupModal) closeModal();
});

// Form submission
loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlert();

  const email = emailInput?.value.trim().toLowerCase() ?? '';
  const password = passwordInput?.value ?? '';

  if (!email || !password) {
    showAlert('Please enter both your email address and password.');
    return;
  }

  isSubmitting = true;
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.innerHTML = '<span>Verifying Credentials...</span>';
  loginSubmitBtn.style.opacity = '0.75';

  try {
    await setPersistence(Boolean(rememberMeCheckbox?.checked));
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    showAlert('Login successful! Redirecting to your portal...', true);
    await routeUser(data.user, email);
  } catch (error) {
    console.error('Portal sign in error:', error);
    showAlert(
      ERROR_MESSAGES[error.code] ||
        (error.message
          ? error.message
          : 'Login failed. Please check your connection and try again.')
    );
    isSubmitting = false;
    loginSubmitBtn.disabled = false;
    loginSubmitBtn.innerHTML =
      '<span>Sign In to Account</span><span class="transition-transform group-hover:translate-x-1">→</span>';
    loginSubmitBtn.style.opacity = '1';
  }
});
