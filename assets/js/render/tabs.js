/**
 * Tab navigation.
 *
 * Works on the `data-tab-button` / `data-tab-content` convention used by the
 * admin and super-admin dashboards.
 */

const BUTTON_SELECTOR = '[data-tab-button]';
const PANEL_SELECTOR = '[data-tab-content]';

/**
 * @param {string} name - the data-tab-content value to reveal
 */
export function activateTab(name) {
  const buttons = document.querySelectorAll(BUTTON_SELECTOR);
  const panels = document.querySelectorAll(PANEL_SELECTOR);

  for (const button of buttons) {
    button.classList.toggle('active', button.getAttribute('data-tab-button') === name);
  }
  for (const panel of panels) {
    panel.classList.toggle('hidden', panel.getAttribute('data-tab-content') !== name);
  }
}

/**
 * Wires tab buttons, delegating so no inline onclick is needed.
 *
 * Returns the name of the panel that is visible on load, so callers can run
 * page-specific setup for it.
 *
 * @returns {string|null}
 */
export function initTabs() {
  const buttons = document.querySelectorAll(BUTTON_SELECTOR);
  const panels = document.querySelectorAll(PANEL_SELECTOR);

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest(BUTTON_SELECTOR) : null;
    if (!button) return;
    activateTab(button.getAttribute('data-tab-button'));
  });

  // Whichever panel is not `hidden` on load is the active one.
  for (const panel of panels) {
    if (!panel.classList.contains('hidden')) {
      return panel.getAttribute('data-tab-content');
    }
  }
  return buttons.length ? buttons[0].getAttribute('data-tab-button') : null;
}
