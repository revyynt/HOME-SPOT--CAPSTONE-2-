/**
 * Pure string / formatting helpers.
 *
 * Nothing in `lib/` may touch the DOM, Firebase, or the network -- that is what
 * makes these modules directly importable by `node --test`.
 */

/**
 * Escapes text for safe interpolation into innerHTML.
 *
 * Use this for every value that reaches innerHTML, including attribute values.
 * Note that HTML attribute values are decoded before the JS parser runs, so
 * escaping is NOT sufficient to make a value safe inside an inline
 * `onclick="..."`. Put values in `data-*` attributes instead.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/**
 * Formats a peso amount the way the UI displays it.
 * @param {number|string} amount
 * @returns {string} e.g. "₱5,000.00"
 */
export function formatPHP(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '₱0.00';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2
  }).format(value);
}

/**
 * Converts pesos to centavos (PayMongo's amount unit).
 * @param {number|string} amountInPesos
 * @returns {number}
 */
export function toCentavos(amountInPesos) {
  return Math.round(parseFloat(amountInPesos) * 100);
}

/**
 * Up to two uppercase initials from a display name.
 * @param {string} name
 * @param {number} [max]
 * @returns {string}
 */
export function initials(name, max = 2) {
  return String(name || 'T')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, max)
    .join('')
    .toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-blue-600 to-indigo-600',
  'from-emerald-600 to-teal-600',
  'from-purple-600 to-pink-600',
  'from-amber-600 to-orange-600',
  'from-rose-600 to-red-600',
  'from-cyan-600 to-blue-600'
];

/**
 * Deterministically picks a Tailwind gradient class pair from a name, so the
 * same tenant always gets the same avatar colour.
 * @param {string} name
 * @returns {string}
 */
export function avatarGradient(name) {
  const source = name || '';
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = source.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

/**
 * Reads a query-string parameter.
 * @param {string} name
 * @param {string} [search]
 * @returns {string|null}
 */
export function getUrlParam(name, search) {
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  return new URLSearchParams(query).get(name);
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const parsed = new Date(ts).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Pure helper: groups tenant/admin message docs by email and merges enrolled tenants.
 * @param {Array<{id: string, data: () => Object}>} docList
 * @param {Array<Object>} tenants
 */
export function buildTenantThreads(docList = [], tenants = []) {
  const byEmail = new Map();

  for (const t of tenants) {
    const email = (t.email || '').trim().toLowerCase();
    if (!email) continue;
    byEmail.set(email, {
      email: t.email.trim(),
      name: t.name || t.email.split('@')[0] || 'Tenant',
      room: t.room || '',
      unreadCount: 0,
      lastTime: 0,
      lastMessage: null,
      items: []
    });
  }

  for (const doc of docList) {
    const data = doc.data();
    if (data.sender !== 'tenant' && data.sender !== 'admin') continue;
    const rawEmail = (data.email || '').trim();
    const key = rawEmail.toLowerCase();
    if (!key) continue;

    if (!byEmail.has(key)) {
      byEmail.set(key, {
        email: rawEmail,
        name: data.name || rawEmail.split('@')[0] || 'Tenant',
        room: data.room || '',
        unreadCount: 0,
        lastTime: 0,
        lastMessage: null,
        items: []
      });
    }

    const thread = byEmail.get(key);
    if (data.name && data.sender === 'tenant') thread.name = data.name;
    if (data.room && !thread.room) thread.room = data.room;

    const createdMs = toMillis(data._serverCreatedAt || data.createdAt);
    const isUnread = data.sender === 'tenant' && data.status === 'Unread';
    if (isUnread) thread.unreadCount += 1;

    thread.items.push({
      id: doc.id,
      sender: data.sender,
      text: data.message || '',
      timeMs: createdMs,
      unread: isUnread,
      legacyReply: false
    });

    if (data.reply) {
      const replyMs = toMillis(data.repliedAt) || createdMs + 1;
      thread.items.push({
        id: doc.id,
        sender: 'admin',
        text: data.reply,
        timeMs: replyMs,
        unread: false,
        legacyReply: true
      });
    }
  }

  const threads = Array.from(byEmail.values());
  for (const thread of threads) {
    thread.items.sort((a, b) => a.timeMs - b.timeMs);
    const last = thread.items.at(-1) || null;
    thread.lastMessage = last;
    thread.lastTime = last ? last.timeMs : 0;
  }

  threads.sort((a, b) => b.lastTime - a.lastTime || a.name.localeCompare(b.name));
  return threads;
}

const PAYMONGO_METHOD_MAP = {
  gcash: 'PayMongo Checkout (GCash)',
  maya: 'PayMongo Checkout (Maya)',
  paymaya: 'PayMongo Checkout (Maya)',
  qrph: 'PayMongo Checkout (QR Ph)',
  'qr ph': 'PayMongo Checkout (QR Ph)',
  qr_ph: 'PayMongo Checkout (QR Ph)',
  card: 'PayMongo Checkout (Card)',
  credit_card: 'PayMongo Checkout (Card)',
  debit_card: 'PayMongo Checkout (Card)',
  grab_pay: 'PayMongo Checkout (GrabPay)',
  grabpay: 'PayMongo Checkout (GrabPay)'
};

/**
 * Formats a raw payment method or PayMongo checkout session/payment resource
 * into a standardized human-readable label such as:
 *   - "PayMongo Checkout (GCash)"
 *   - "PayMongo Checkout (Maya)"
 *   - "PayMongo Checkout (QR Ph)"
 *   - "PayMongo Checkout (Card)"
 *   - "PayMongo Checkout (GrabPay)"
 *
 * @param {string} [rawMethod]
 * @param {Object} [sessionOrPayment]
 * @returns {string}
 */
export function formatPaymentMethod(rawMethod, sessionOrPayment = null) {
  let candidate = String(rawMethod || '').trim();

  if (sessionOrPayment && typeof sessionOrPayment === 'object') {
    const attrs = sessionOrPayment.attributes || sessionOrPayment;
    const piAttrs = attrs?.payment_intent?.attributes || attrs?.payment_intent || null;
    const payments = Array.isArray(attrs?.payments)
      ? attrs.payments
      : Array.isArray(piAttrs?.payments)
        ? piAttrs.payments
        : Array.isArray(attrs?.payment_intent?.payments)
          ? attrs.payment_intent.payments
          : [];
    const lastPayment =
      payments[payments.length - 1]?.attributes || payments[payments.length - 1] || null;
    const firstPayment = payments[0]?.attributes || payments[0] || null;
    const lastErr = piAttrs?.last_payment_error || attrs?.last_payment_error || null;

    const detected =
      attrs?.payment_method_used ||
      lastPayment?.source?.type ||
      lastPayment?.payment_method_type ||
      firstPayment?.source?.type ||
      firstPayment?.payment_method_type ||
      lastErr?.payment_method?.type ||
      lastErr?.payment_method_type ||
      piAttrs?.payment_method_used ||
      (Array.isArray(attrs?.payment_method_types) && attrs.payment_method_types.length === 1
        ? attrs.payment_method_types[0]
        : '');

    if (detected) {
      candidate = String(detected).trim();
    }
  }

  if (!candidate) return 'PayMongo Checkout';

  if (/^PayMongo Checkout\s*\(.+\)$/i.test(candidate)) {
    return candidate.replace(/^paymongo checkout/i, 'PayMongo Checkout');
  }

  const lower = candidate.toLowerCase();
  if (PAYMONGO_METHOD_MAP[lower]) {
    return PAYMONGO_METHOD_MAP[lower];
  }

  if (lower.includes('gcash')) return 'PayMongo Checkout (GCash)';
  if (lower.includes('maya')) return 'PayMongo Checkout (Maya)';
  if (lower.includes('qrph') || lower.includes('qr ph')) return 'PayMongo Checkout (QR Ph)';
  if (lower.includes('grab')) return 'PayMongo Checkout (GrabPay)';
  if (
    lower.includes('card') ||
    lower.includes('3ds') ||
    lower.includes('visa') ||
    lower.includes('mastercard')
  ) {
    return 'PayMongo Checkout (Card)';
  }
  if (lower === 'paymongo' || lower === 'paymongo checkout') {
    return 'PayMongo Checkout';
  }

  return candidate;
}

/**
 * Resolves a human-readable failure reason tailored to the payment channel and gateway error.
 * @param {Object} [sessionOrPayment]
 * @param {string} [method]
 * @returns {string}
 */
export function getPaymentFailureReason(sessionOrPayment = null, method = '') {
  let detail = '';
  if (sessionOrPayment && typeof sessionOrPayment === 'object') {
    const attrs = sessionOrPayment.attributes || sessionOrPayment;
    const piAttrs = attrs?.payment_intent?.attributes || attrs?.payment_intent || null;
    const lastErr = piAttrs?.last_payment_error || attrs?.last_payment_error || null;
    const payments = Array.isArray(attrs?.payments)
      ? attrs.payments
      : Array.isArray(piAttrs?.payments)
        ? piAttrs.payments
        : [];
    const lastPayment =
      payments[payments.length - 1]?.attributes || payments[payments.length - 1] || null;

    detail =
      lastErr?.failed_message ||
      lastErr?.detail ||
      lastErr?.message ||
      lastPayment?.failed_message ||
      lastPayment?.error_message ||
      '';
  }

  if (detail && typeof detail === 'string' && detail.trim().length > 3) {
    return detail.trim();
  }

  const lowerMethod = String(method || '').toLowerCase();
  if (lowerMethod.includes('gcash')) {
    return 'GCash authorization failed, was declined, or expired on PayMongo.';
  }
  if (lowerMethod.includes('maya')) {
    return 'Maya authorization failed, was declined, or expired on PayMongo.';
  }
  if (lowerMethod.includes('qrph') || lowerMethod.includes('qr ph')) {
    return 'QR Ph payment was cancelled, expired, or declined on PayMongo.';
  }
  if (lowerMethod.includes('grab')) {
    return 'GrabPay authorization failed, was declined, or expired on PayMongo.';
  }
  if (
    lowerMethod.includes('card') ||
    lowerMethod.includes('3ds') ||
    lowerMethod.includes('visa') ||
    lowerMethod.includes('mastercard')
  ) {
    return 'Card was declined or 3DS verification failed on PayMongo.';
  }

  return 'Payment authorization failed, was cancelled, or expired on PayMongo.';
}

/**
 * Deduplicates payment records that originated from both client redirect and provider webhook.
 * Collapses records sharing the same resource/session ID, or same tenant + amount + purpose within a 15-minute window.
 *
 * @param {Array<Object>} payments
 * @returns {Array<Object>}
 */
export function deduplicatePayments(payments) {
  if (!Array.isArray(payments) || payments.length === 0) return [];

  const results = [];

  for (const p of payments) {
    if (!p || typeof p !== 'object') continue;

    const pId = p.id || p.payMongoResourceId || p.paymentMethodId || p.sessionId;
    const ref = p.referenceNumber || p.reference_number;
    const rawPurpose = p.purpose || p.description || 'Monthly Rent';
    const cleanPurpose = rawPurpose
      .replace(/\s*-\s*MJP Residences\s*$/i, '')
      .trim()
      .toLowerCase();
    const amount = Number(p.amount) || 0;
    const tenant = (p.tenantEmail || p.tenantName || p.tenant_email || p.tenant_name || '')
      .toLowerCase()
      .trim();
    const rawTime = p.createdAt || p.created_at || p.timestamp || p.dateFormatted;
    const timeMs = rawTime ? new Date(rawTime).getTime() : 0;
    const normalizedMethod = formatPaymentMethod(p.method || p.payment_method, p);

    const matchedExisting = results.find((existing) => {
      const exId =
        existing.id ||
        existing.payMongoResourceId ||
        existing.paymentMethodId ||
        existing.sessionId;
      const exRef = existing.referenceNumber || existing.reference_number;
      if (pId && exId && pId === exId) return true;
      if (ref && exRef && ref === exRef) return true;

      const exTenant = (
        existing.tenantEmail ||
        existing.tenantName ||
        existing.tenant_email ||
        existing.tenant_name ||
        ''
      )
        .toLowerCase()
        .trim();
      const exAmount = Number(existing.amount) || 0;
      const exRawPurpose = existing.purpose || existing.description || 'Monthly Rent';
      const exCleanPurpose = exRawPurpose
        .replace(/\s*-\s*MJP Residences\s*$/i, '')
        .trim()
        .toLowerCase();
      const exRawTime =
        existing.createdAt || existing.created_at || existing.timestamp || existing.dateFormatted;
      const exTimeMs = exRawTime ? new Date(exRawTime).getTime() : 0;

      if (
        tenant &&
        exTenant &&
        tenant === exTenant &&
        amount === exAmount &&
        cleanPurpose === exCleanPurpose
      ) {
        if (timeMs && exTimeMs) {
          if (Math.abs(timeMs - exTimeMs) <= 15 * 60 * 1000) return true;
        } else {
          return true;
        }
      }
      return false;
    });

    if (matchedExisting) {
      if (
        (!matchedExisting.method || matchedExisting.method === 'PayMongo Checkout') &&
        normalizedMethod.includes('(')
      ) {
        matchedExisting.method = normalizedMethod;
      }
      if (
        !matchedExisting.sessionId &&
        (p.sessionId || (typeof pId === 'string' && pId.startsWith('cs_')))
      ) {
        matchedExisting.sessionId = p.sessionId || pId;
      }
      continue;
    }

    const clone = { ...p, method: normalizedMethod };
    if (!clone.sessionId && typeof pId === 'string' && pId.startsWith('cs_')) {
      clone.sessionId = pId;
    }
    if (typeof clone.purpose === 'string' && clone.purpose.includes(' - MJP Residences')) {
      clone.purpose = clone.purpose.replace(/\s*-\s*MJP Residences\s*$/i, '').trim();
    }
    results.push(clone);
  }

  return results;
}

/**
 * Validates a Philippine mobile or landline phone number.
 * Accepts:
 *   - 09XXXXXXXXX (11 digits)
 *   - +639XXXXXXXXX or 639XXXXXXXXX (12 digits)
 *   - 9XXXXXXXXX (10 digits)
 *   - (02) XXXX-XXXX / 02XXXXXXX(X) (Metro Manila landline)
 * @param {string} raw
 * @returns {boolean}
 */
export function isValidPhilippinePhone(raw) {
  const str = String(raw || '').trim();
  if (!str) return false;
  if (/[^0-9+\s()-]/.test(str)) return false;
  const compact = str.replace(/[\s()-]/g, '');
  return /^(\+?639\d{9}|09\d{9}|9\d{9}|\+?632\d{7,8}|02\d{7,8})$/.test(compact);
}

/**
 * Normalizes a valid Philippine phone number into a clean standard format
 * (09XXXXXXXXX for mobile), or returns '' if invalid.
 * @param {string} raw
 * @returns {string}
 */
export function normalizePhilippinePhone(raw) {
  if (!isValidPhilippinePhone(raw)) return '';
  const compact = String(raw || '')
    .trim()
    .replace(/[\s()-]/g, '');
  if (/^\+?639\d{9}$/.test(compact)) {
    return '0' + compact.replace(/^\+?63/, '');
  }
  if (/^9\d{9}$/.test(compact)) {
    return '0' + compact;
  }
  return compact;
}

/**
 * Returns today's date in local timezone as YYYY-MM-DD.
 * @param {Date} [now]
 * @returns {string}
 */
export function todayIsoLocal(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * Returns true if a YYYY-MM-DD date string is strictly before today in local time.
 * @param {string} dateStr
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isPastDate(dateStr, now = new Date()) {
  const clean = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return false;
  return clean < todayIsoLocal(now);
}
