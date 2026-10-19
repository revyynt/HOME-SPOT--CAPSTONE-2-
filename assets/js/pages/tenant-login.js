import { db, supabase, supabaseData } from '../supabase-service.js';

window.location.replace('./login.html');

const ERROR_MESSAGES = {
  invalid_credentials: 'Account not found or password incorrect.',
  user_not_found: 'Account not found or password incorrect.',
  over_request_rate_limit: 'Too many failed attempts. Please wait a moment.'
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
  alertBox.textContent = message;
}

function clearAlert() {
  if (!alertBox) return;
  alertBox.style.display = 'none';
  alertBox.textContent = '';
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = data.user;
    if (user.app_metadata?.role !== 'tenant') {
      await supabase.auth.signOut();
      throw new Error('This account is not configured as a tenant.');
    }

    const profile = await loadProfile(user.id);
    seedSession(profile, user.email || email);

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
