import { authReady, db, getCurrentUser, setPersistence, supabase, supabaseData } from '../supabase-service.js';
import { Toast } from '../render/toast.js';

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

async function loadProfile(uid, email) {
  let snapshot = await supabaseData.getDocs(
    supabaseData.query(supabaseData.collection(db, 'tenants'), supabaseData.where('uid', '==', uid))
  );
  if (snapshot.empty && email) {
    snapshot = await supabaseData.getDocs(
      supabaseData.query(
        supabaseData.collection(db, 'tenants'),
        supabaseData.where('email', '==', email.toLowerCase())
      )
    );
  }
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

// ---------------------------------------------------------------------------
// Supabase Reauthentication via Gmail OTP for Admin and Superadmin
// ---------------------------------------------------------------------------
const adminOtpModal = document.getElementById('adminOtpModal');
const adminOtpForm = document.getElementById('adminOtpForm');
const adminOtpInput = document.getElementById('adminOtpInput');
const adminOtpTargetEmail = document.getElementById('adminOtpTargetEmail');
const adminOtpAlert = document.getElementById('adminOtpAlert');
const submitAdminOtpBtn = document.getElementById('submitAdminOtpBtn');
const cancelAdminOtpBtn = document.getElementById('cancelAdminOtpBtn');
const closeAdminOtpBtn = document.getElementById('closeAdminOtpBtn');
const resendAdminOtpBtn = document.getElementById('resendAdminOtpBtn');
const resendAdminOtpCountdown = document.getElementById('resendAdminOtpCountdown');

let pendingAdminUser = null;
let pendingAdminDestination = '';
let resendTimerInterval = null;
let resendSecondsRemaining = 0;
let isSendingAdminOtp = false;

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [uname, domain] = email.split('@');
  if (uname.length <= 2) return `${uname[0]}*@${domain}`;
  return `${uname[0]}***${uname[uname.length - 1]}@${domain}`;
}

function showAdminOtpAlert(message, isSuccess = false) {
  if (!adminOtpAlert) return;
  adminOtpAlert.className = `p-3 rounded-lg text-xs ${
    isSuccess
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      : 'bg-red-50 text-red-700 border border-red-200'
  }`;
  adminOtpAlert.textContent = message;
  adminOtpAlert.classList.remove('hidden');
}

function clearAdminOtpAlert() {
  if (!adminOtpAlert) return;
  adminOtpAlert.textContent = '';
  adminOtpAlert.classList.add('hidden');
}

function startResendCooldown(seconds = 60) {
  resendSecondsRemaining = seconds;
  if (resendTimerInterval) clearInterval(resendTimerInterval);
  if (resendAdminOtpBtn) resendAdminOtpBtn.disabled = true;

  const update = () => {
    if (resendSecondsRemaining <= 0) {
      clearInterval(resendTimerInterval);
      resendTimerInterval = null;
      if (resendAdminOtpBtn) resendAdminOtpBtn.disabled = false;
      if (resendAdminOtpCountdown) resendAdminOtpCountdown.textContent = '';
    } else {
      if (resendAdminOtpCountdown) {
        resendAdminOtpCountdown.textContent = `(${resendSecondsRemaining}s)`;
      }
      resendSecondsRemaining--;
    }
  };

  update();
  resendTimerInterval = setInterval(update, 1000);
}

async function triggerAdminOtp(user, destination) {
  if (isSendingAdminOtp) return;
  if (adminOtpModal && !adminOtpModal.classList.contains('hidden') && pendingAdminUser?.id === user?.id) return;
  isSendingAdminOtp = true;
  pendingAdminUser = user;
  pendingAdminDestination = destination;
  clearAlert();
  clearAdminOtpAlert();

  if (adminOtpTargetEmail) {
    adminOtpTargetEmail.textContent = maskEmail(user.email);
  }

  if (adminOtpModal) {
    adminOtpModal.classList.remove('hidden');
  }
  if (adminOtpInput) {
    adminOtpInput.value = '';
    adminOtpInput.focus();
  }

  startResendCooldown(60);

  // Trigger Supabase Reauthentication email template
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: user.email,
      options: { shouldCreateUser: false }
    });
    if (error) {
      console.warn('OTP send notice:', error);
      showAdminOtpAlert(error.message || 'Error sending verification code. Click Resend to try again.');
    }
  } catch (err) {
    console.warn('OTP error:', err);
    showAdminOtpAlert(err.message || 'Error sending verification code. Click Resend to try again.');
  } finally {
    isSendingAdminOtp = false;
    isSubmitting = false;
    if (loginSubmitBtn) {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.innerHTML =
        '<span>Sign In to Account</span><span class="transition-transform group-hover:translate-x-1">→</span>';
      loginSubmitBtn.style.opacity = '1';
    }
  }
}

adminOtpForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAdminOtpAlert();

  const code = (adminOtpInput?.value || '').trim();
  if (!code || code.length < 6) {
    showAdminOtpAlert('Please enter the verification code sent to your Gmail.');
    return;
  }

  if (!pendingAdminUser?.email) {
    showAdminOtpAlert('Session expired. Please sign in again.');
    return;
  }

  if (submitAdminOtpBtn) {
    submitAdminOtpBtn.disabled = true;
    submitAdminOtpBtn.textContent = 'Verifying...';
  }

  try {
    const { error } = await supabase.auth.verifyOtp({
      email: pendingAdminUser.email,
      token: code,
      type: 'email'
    });

    if (error) throw error;

    showAdminOtpAlert('Verification successful! Entering dashboard...', true);
    sessionStorage.setItem('admin_otp_verified', 'true');

    setTimeout(() => {
      window.location.href = pendingAdminDestination;
    }, 400);
  } catch (error) {
    console.error('OTP verification error:', error);
    showAdminOtpAlert(
      error.message || 'Invalid or expired verification code. Please check and try again.'
    );
    if (submitAdminOtpBtn) {
      submitAdminOtpBtn.disabled = false;
      submitAdminOtpBtn.textContent = 'Verify & Sign In';
    }
  }
});

resendAdminOtpBtn?.addEventListener('click', async () => {
  if (resendSecondsRemaining > 0 || !pendingAdminUser?.email) return;
  clearAdminOtpAlert();

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: pendingAdminUser.email,
      options: { shouldCreateUser: false }
    });
    if (error) throw error;

    showAdminOtpAlert('A fresh verification code has been sent to your Gmail.', true);
    startResendCooldown(60);
  } catch (err) {
    showAdminOtpAlert(err.message || 'Unable to resend verification code right now. Try again shortly.');
  }
});

async function cancelAdminOtp() {
  if (resendTimerInterval) clearInterval(resendTimerInterval);
  if (adminOtpModal) adminOtpModal.classList.add('hidden');
  pendingAdminUser = null;
  pendingAdminDestination = '';
  sessionStorage.removeItem('admin_otp_verified');
  try {
    await supabase.auth.signOut();
  } catch {}
}

cancelAdminOtpBtn?.addEventListener('click', cancelAdminOtp);
closeAdminOtpBtn?.addEventListener('click', cancelAdminOtp);

async function routeUser(user, fallbackEmail) {
  const role =
    user?.app_metadata?.role || (user?.user_metadata?.role === 'tenant' ? 'tenant' : undefined);
  const destination = ROLE_DESTINATIONS[role];

  if (!destination) {
    await supabase.auth.signOut();
    throw new Error(
      'Your account does not have a portal role assigned. Please contact management.'
    );
  }

  if (role === 'tenant') {
    const profile = await loadProfile(user.id, user.email || fallbackEmail);
    seedSession(profile, user.email || fallbackEmail);
    window.location.href = destination;
    return;
  }

  // Admin and Superadmin require Reauthentication PIN verification
  if (role === 'admin' || role === 'superadmin') {
    await triggerAdminOtp(user, destination);
    return;
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

// Forgot password modal
const forgotModal = document.getElementById('forgotPasswordModal');
const forgotEmailInput = document.getElementById('forgotEmail');
const forgotForm = document.getElementById('forgotPasswordForm');
const closeForgotBtn = document.getElementById('closeForgotModalBtn');
const cancelForgotBtn = document.getElementById('cancelForgotBtn');
const submitForgotBtn = document.getElementById('submitForgotBtn');
const forgotAlert = document.getElementById('forgotAlert');

function openForgotModal() {
  if (forgotAlert) forgotAlert.classList.add('hidden');
  if (forgotEmailInput) forgotEmailInput.value = emailInput?.value.trim() || '';
  if (forgotModal) forgotModal.classList.remove('hidden');
}

function closeForgotModal() {
  if (forgotModal) forgotModal.classList.add('hidden');
}

forgotPasswordBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  openForgotModal();
});

closeForgotBtn?.addEventListener('click', closeForgotModal);
cancelForgotBtn?.addEventListener('click', closeForgotModal);
forgotModal?.addEventListener('click', (e) => {
  if (e.target === forgotModal) closeForgotModal();
});

forgotForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = forgotEmailInput?.value.trim().toLowerCase();
  if (!email) return;

  if (submitForgotBtn) {
    submitForgotBtn.disabled = true;
    submitForgotBtn.textContent = 'Sending Link...';
  }

  try {
    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    });
    if (error) throw error;

    closeForgotModal();
    Toast.alert({
      title: 'Reset Link Sent',
      message: `An official password reset link has been dispatched to ${email}. Please check your inbox!`
    });
  } catch (err) {
    console.error('Password reset email error:', err);
    if (forgotAlert) {
      forgotAlert.className = 'p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200';
      forgotAlert.textContent = err.message || 'Could not send reset email. Please try again.';
      forgotAlert.classList.remove('hidden');
    }
  } finally {
    if (submitForgotBtn) {
      submitForgotBtn.disabled = false;
      submitForgotBtn.textContent = 'Send Reset Link';
    }
  }
});


let isRecoveringPassword = false;

// Check URL hash for errors or recovery tokens on page load
function checkAuthHashState() {
  if (typeof window === 'undefined' || !window.location.hash) return;
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const error = params.get('error');
  const errorCode = params.get('error_code');
  const errorDesc = params.get('error_description');

  if (error || errorCode) {
    let msg = 'The password reset link is invalid or has expired.';
    if (errorCode === 'otp_expired' || (errorDesc && errorDesc.toLowerCase().includes('expired'))) {
      msg = 'This password reset link has expired or was already used. Please click "Forgot password?" to send a fresh reset link.';
    } else if (errorDesc) {
      msg = decodeURIComponent(errorDesc.replace(/\+/g, ' '));
    }
    Toast.alert({
      title: 'Reset Link Expired',
      message: msg
    });
    try {
      history.replaceState(null, '', window.location.pathname);
    } catch {
      // Ignore history state errors
    }
    return;
  }

  if (hash.includes('type=recovery') || hash.includes('access_token')) {
    isRecoveringPassword = true;
    const modal = document.getElementById('updatePasswordModal');
    if (modal) modal.classList.remove('hidden');
  }
}

checkAuthHashState();

// Recovery Handler (When tenant lands here from email link)
const updatePassModal = document.getElementById('updatePasswordModal');
const updatePassForm = document.getElementById('updatePasswordForm');
const newPassInput = document.getElementById('newPassword');
const confirmPassInput = document.getElementById('confirmNewPassword');
const submitUpdateBtn = document.getElementById('submitUpdatePassBtn');
const updatePassAlert = document.getElementById('updatePassAlert');

supabase.auth.onAuthStateChange(async (event) => {
  if (event === 'PASSWORD_RECOVERY') {
    isRecoveringPassword = true;
    if (updatePassModal) updatePassModal.classList.remove('hidden');
  }
});

updatePassForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPass = newPassInput?.value || '';
  const confirmPass = confirmPassInput?.value || '';

  if (newPass.length < 6) {
    if (updatePassAlert) {
      updatePassAlert.className = 'p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200';
      updatePassAlert.textContent = 'Password must be at least 6 characters.';
      updatePassAlert.classList.remove('hidden');
    }
    return;
  }

  if (newPass !== confirmPass) {
    if (updatePassAlert) {
      updatePassAlert.className = 'p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200';
      updatePassAlert.textContent = 'Passwords do not match.';
      updatePassAlert.classList.remove('hidden');
    }
    return;
  }

  if (submitUpdateBtn) {
    submitUpdateBtn.disabled = true;
    submitUpdateBtn.textContent = 'Updating...';
  }

  try {
    const { data: updated, error } = await supabase.auth.updateUser({ password: newPass });
    if (error) throw error;

    if (updatePassModal) updatePassModal.classList.add('hidden');
    isRecoveringPassword = false;
    try { history.replaceState(null, '', window.location.pathname); } catch { }
    Toast.alert({
      title: 'Password Updated',
      message: 'Your new password is set! Redirecting to your portal...'
    });

    const user = updated?.user || (await getCurrentUser());
    if (user) {
      await routeUser(user, user.email);
    } else {
      window.location.reload();
    }
  } catch (err) {
    console.error('Update password error:', err);
    if (updatePassAlert) {
      updatePassAlert.className = 'p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200';
      updatePassAlert.textContent = err.message || 'Failed to update password. Link may be expired.';
      updatePassAlert.classList.remove('hidden');
    }
  } finally {
    if (submitUpdateBtn) {
      submitUpdateBtn.disabled = false;
      submitUpdateBtn.textContent = 'Update Password & Continue';
    }
  }
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
  if (isSubmitting) return;
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
    await setPersistence(true);
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

async function checkExistingSession() {
  if (
    isRecoveringPassword ||
    (typeof window !== 'undefined' &&
      window.location.hash &&
      (window.location.hash.includes('type=recovery') || window.location.hash.includes('access_token')))
  ) {
    console.log('[auth] In password recovery, preventing auto-redirect to portal');
    return;
  }
  try {
    await authReady;
    if (
      isRecoveringPassword ||
      (typeof window !== 'undefined' &&
        window.location.hash &&
        (window.location.hash.includes('type=recovery') || window.location.hash.includes('access_token')))
    ) {
      return;
    }
    const user = await getCurrentUser();
    if (!user) return;
    const role =
      user.app_metadata?.role || (user.user_metadata?.role === 'tenant' ? 'tenant' : undefined);
    const destination = ROLE_DESTINATIONS[role];
    if (destination) {
      if ((role === 'admin' || role === 'superadmin') && sessionStorage.getItem('admin_otp_verified') !== 'true') {
        if (adminOtpModal && !adminOtpModal.classList.contains('hidden')) return;
        if (isSubmitting || isSendingAdminOtp) return;
        await triggerAdminOtp(user, destination);
        return;
      }
      window.location.replace(destination);
    }
  } catch (error) {
    console.warn('[auth] Existing session check error:', error);
  }
}

checkExistingSession();
