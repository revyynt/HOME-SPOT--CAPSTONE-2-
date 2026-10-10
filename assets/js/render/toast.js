/**
 * Toast notifications.
 *
 * The icon is injected as HTML (it is a fixed literal), but the message is set
 * via textContent -- toast copy is routinely built from Firestore values such
 * as tenant names, and parsing that as HTML was an XSS sink.
 */

const ICONS = {
  success:
    '<svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>',
  error:
    '<svg class="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 0L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>'
};

const DISMISS_MS = 3000;

export const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  /**
   * @param {string} message - shown as text, never parsed as HTML
   * @param {'success'|'error'} [type]
   */
  show(message, type = 'success') {
    this.init();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = document.createElement('span');
    icon.innerHTML = ICONS[type] ?? ICONS.success;

    const text = document.createElement('span');
    text.textContent = String(message ?? '');

    toast.append(icon, text);
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, DISMISS_MS);
  },

  /** @param {string} message */
  success(message) {
    this.show(message, 'success');
  },

  /** @param {string} message */
  error(message) {
    this.show(message, 'error');
  }
};
