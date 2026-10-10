/**
 * Small DOM helpers.
 *
 * These touch the document, so they are NOT importable by node --test. Keep pure
 * logic in ./format.js instead.
 */

/**
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function byId(id) {
  return document.getElementById(id);
}

/**
 * @param {string} selector
 * @param {ParentNode} [scope]
 * @returns {Element|null}
 */
export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

/**
 * @param {string} selector
 * @param {ParentNode} [scope]
 * @returns {Element[]}
 */
export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

/**
 * Sets textContent only when the value actually changed, so we do not thrash
 * layout on Firestore snapshots.
 *
 * @param {string} id
 * @param {string} value
 */
export function setText(id, value) {
  const el = byId(id);
  if (el && el.textContent !== value) el.textContent = value;
}

/**
 * Delegates a click from a container to matching descendants.
 *
 * Replaces inline `onclick` attributes, which is required for anything in a
 * module (module scope is not visible to inline handlers) and is what keeps
 * Firestore values out of JS string literals.
 *
 * @param {string} selector - e.g. 'button[data-action]'
 * @param {(element: HTMLElement, event: Event) => void} handler
 * @param {ParentNode} [scope]
 */
export function onClick(selector, handler, scope = document) {
  scope.addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target.closest(selector) : null;
    if (el) handler(el, event);
  });
}

/**
 * Escapes a value for use inside a double-quoted HTML attribute.
 * Combined with escapeHtml from ./format.js this is safe for text nodes; for JS
 * contexts prefer data-* attributes over string interpolation entirely.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function attr(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[ch]
  );
}
