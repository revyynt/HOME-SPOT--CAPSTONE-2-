import { setPersistence, supabase } from '../supabase-service.js';

window.location.replace('./login.html');

const ROLE_DESTINATIONS = {
  superadmin: './super-admin-dashboard.html',
  admin: './admin-dashboard.html'
};

const ERROR_MESSAGES = {
  invalid_email: 'Invalid email address.',
  invalid_credentials: 'Incorrect email or password.',
  user_banned: 'This user has been disabled.',
  over_email_send_rate_limit: 'Too many attempts. Try again later.'
};

function readRole(user) {
  return user?.app_metadata?.role || null;
}

function redirectForRole(role) {
  const destination = ROLE_DESTINATIONS[role];
  if (!destination) return false;
  window.location.href = destination;
  return true;
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

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) redirectForRole(readRole(session.user));
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const formData = new FormData(loginForm);
  const email = formData.get('email');
  const password = formData.get('password');

  if (!email || !password) {
    showError('Please enter both email and password.');
    return;
  }

  try {
    await setPersistence(Boolean(rememberCheckbox?.checked));
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (!redirectForRole(readRole(data.user))) {
      await supabase.auth.signOut();
      showError('Your account does not have a role assigned. Please contact support.');
    }
  } catch (error) {
    console.error(error);
    showError(ERROR_MESSAGES[error.code] || 'Login failed. Please check your email and password.');
  }
});
