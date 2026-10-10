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
