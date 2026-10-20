/**
 * Toast notifications.
 *
 * The icon is injected as HTML (it is a fixed literal), but the message is set
 * via textContent -- toast copy is routinely built from database values such
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
  },

  /**
   * Renders a clean, styled in-page modal dialog (replaces browser alert/confirm/prompt).
   * @param {Object} options
   * @param {string} [options.title]
   * @param {string} options.message
   * @param {string} [options.confirmText]
   * @param {string|null} [options.cancelText]
   * @param {boolean} [options.danger]
   * @param {boolean} [options.hasInput]
   * @param {string} [options.placeholder]
   * @returns {Promise<{confirmed: boolean, value: string}>}
   */
  modal({
    title = 'Notice',
    message = '',
    confirmText = 'OK',
    cancelText = null,
    danger = false,
    hasInput = false,
    placeholder = ''
  } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(15,23,42,0.55);backdrop-filter:blur(2px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';

      const card = document.createElement('div');
      card.style.cssText =
        'background:#ffffff;border-radius:16px;max-width:440px;width:100%;box-shadow:0 20px 25px -5px rgba(0,0,0,0.15),0 8px 10px -6px rgba(0,0,0,0.1);border:1px solid #f1f5f9;overflow:hidden;font-family:inherit;';

      const body = document.createElement('div');
      body.style.cssText = 'padding:24px;';

      const heading = document.createElement('h3');
      heading.style.cssText =
        'margin:0 0 8px 0;font-size:18px;font-weight:700;color:#0f172a;line-height:1.3;';
      heading.textContent = String(title);

      const desc = document.createElement('p');
      desc.style.cssText =
        'margin:0;font-size:14px;color:#475569;line-height:1.5;white-space:pre-line;';
      desc.textContent = String(message);

      body.append(heading, desc);

      let inputEl = null;
      if (hasInput) {
        inputEl = document.createElement('textarea');
        inputEl.rows = 3;
        inputEl.placeholder = String(placeholder || '');
        inputEl.style.cssText =
          'margin-top:14px;width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;color:#0f172a;outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;';
        body.appendChild(inputEl);
      }

      const footer = document.createElement('div');
      footer.style.cssText =
        'padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;display:flex;align-items:center;justify-content:flex-end;gap:10px;';

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      if (cancelText) {
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = String(cancelText);
        cancelBtn.style.cssText =
          'padding:9px 16px;border-radius:10px;border:1px solid #cbd5e1;background:#ffffff;color:#334155;font-size:14px;font-weight:600;cursor:pointer;';
        cancelBtn.addEventListener('click', () => cleanup({ confirmed: false, value: '' }));
        footer.appendChild(cancelBtn);
      }

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.textContent = String(confirmText);
      const bg = danger ? '#dc2626' : '#2563eb';
      confirmBtn.style.cssText = `padding:9px 18px;border-radius:10px;border:none;background:${bg};color:#ffffff;font-size:14px;font-weight:600;cursor:pointer;`;
      confirmBtn.addEventListener('click', () =>
        cleanup({ confirmed: true, value: inputEl ? inputEl.value.trim() : '' })
      );
      footer.appendChild(confirmBtn);

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup({ confirmed: false, value: '' });
      });

      card.append(body, footer);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      if (inputEl && typeof inputEl.focus === 'function') inputEl.focus();
    });
  },

  /** @param {string|{title?: string, message: string, confirmText?: string}} opts */
  async alert(opts) {
    const config = typeof opts === 'string' ? { title: 'Notice', message: opts } : opts;
    await this.modal({
      title: config.title || 'Notice',
      message: config.message || '',
      confirmText: config.confirmText || 'OK',
      cancelText: null
    });
  },

  /** @param {string|{title?: string, message: string, confirmText?: string, cancelText?: string, danger?: boolean}} opts */
  async confirm(opts) {
    const config = typeof opts === 'string' ? { title: 'Confirm Action', message: opts } : opts;
    const res = await this.modal({
      title: config.title || 'Confirm Action',
      message: config.message || '',
      confirmText: config.confirmText || 'Confirm',
      cancelText: config.cancelText || 'Cancel',
      danger: Boolean(config.danger)
    });
    return res.confirmed;
  },

  /** @param {{title?: string, message: string, placeholder?: string, confirmText?: string, cancelText?: string, danger?: boolean}} opts */
  async prompt(opts) {
    const res = await this.modal({
      title: opts.title || 'Input Required',
      message: opts.message || '',
      confirmText: opts.confirmText || 'Submit',
      cancelText: opts.cancelText || 'Cancel',
      danger: Boolean(opts.danger),
      hasInput: true,
      placeholder: opts.placeholder || ''
    });
    return res.confirmed ? res.value : null;
  }
};
