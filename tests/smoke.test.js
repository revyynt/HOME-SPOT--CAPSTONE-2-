/**
 * Smoke test: evaluates the DOM-touching modules under a minimal DOM stub.
 *
 * Scope note: modules that import the Firebase SDK from gstatic CDN URLs cannot
 * be loaded by Node (bare URL specifiers are not resolvable), so their import
 * graph is verified statically in structure.test.js instead. What this file
 * covers is the CDN-free DOM layer -- the part most likely to throw at
 * evaluation time or on first call.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

/** Installs a DOM stub on globalThis. Returns a teardown function. */
function installDom() {
  const saved = {};
  const stubElement = (tag = 'div') => {
    const classes = new Set();
    const attrs = {};
    const el = new ElementStub();
    Object.assign(el, {
      tagName: tag,
      style: {},
      dataset: {},
      textContent: '',
      value: '',
      innerHTML: '',
      disabled: false,
      children: [],
      className: '',
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c),
        toggle: (c, force) => (force ? classes.add(c) : classes.delete(c))
      },
      appendChild(child) {
        el.children.push(child);
        return child;
      },
      append: (...nodes) => {
        el.children.push(...nodes);
      },
      remove: () => {},
      getAttribute: (name) => attrs[name] ?? null,
      setAttribute: (name, value) => {
        attrs[name] = value;
      },
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      closest: () => null
    });
    return el;
  };

  const registry = new Map();

  // `instanceof Element` is used by the delegation helpers, so the stub needs
  // a real constructor and instances must inherit from it.
  class ElementStub {}
  globalThis.Element = ElementStub;

  saved.document = globalThis.document;
  saved.window = globalThis.window;

  globalThis.document = {
    documentElement: { dataset: {} },
    body: stubElement('body'),
    createElement: (tag) => stubElement(tag),
    createTextNode: (text) => ({ text }),
    getElementById: (id) => registry.get(id) ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    dispatchEvent: () => true,
    __registry: registry
  };

  globalThis.window = {
    location: {
      search: '',
      href: 'http://localhost:5050/',
      origin: 'http://localhost:5050',
      pathname: '/'
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    localStorage: (() => {
      const s = new Map();
      return {
        getItem: (k) => s.get(k) ?? null,
        setItem: (k, v) => s.set(k, v),
        removeItem: (k) => s.delete(k),
        clear: () => s.clear()
      };
    })(),
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    },
    setTimeout,
    clearTimeout
  };

  return () => {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
    delete globalThis.Element;
  };
}

test('Toast renders without touching innerHTML for the message', async (t) => {
  const teardown = installDom();
  t.after(teardown);

  const { Toast } = await import('../assets/js/render/toast.js');

  Toast.success('Payment recorded for <script>alert(1)</script>');
  Toast.error('Something went wrong');

  const toastContainer = document.body.children[0];
  const toasts = toastContainer.children;
  assert.equal(toasts.length, 2, 'two toasts should be appended');

  const successToast = toasts[0];
  const textSpan = successToast.children.at(-1);
  assert.equal(
    textSpan.textContent,
    'Payment recorded for <script>alert(1)</script>',
    'message is inserted verbatim as text, never parsed as HTML'
  );
});

test('activateTab hides every panel except the requested one', async (t) => {
  const teardown = installDom();
  t.after(teardown);

  const makePanel = (name) => {
    const el = document.createElement('div');
    el.setAttribute('data-tab-content', name);
    el.classList.add('hidden');
    return el;
  };
  const panels = [makePanel('overview'), makePanel('tenants')];
  document.querySelectorAll = (selector) => (selector.includes('data-tab-content') ? panels : []);

  const { activateTab } = await import('../assets/js/render/tabs.js');
  activateTab('tenants');

  assert.equal(panels[1].classList.contains('hidden'), false, 'target panel is revealed');
  assert.equal(panels[0].classList.contains('hidden'), true, 'other panels stay hidden');
});

test('initTabs returns the panel that is visible on load', async (t) => {
  const teardown = installDom();
  t.after(teardown);

  const visible = document.createElement('div');
  visible.setAttribute('data-tab-content', 'overview');
  const hidden = document.createElement('div');
  hidden.setAttribute('data-tab-content', 'tenants');
  hidden.classList.add('hidden');

  document.querySelectorAll = (selector) =>
    selector.includes('data-tab-content') ? [visible, hidden] : [];

  const { initTabs } = await import('../assets/js/render/tabs.js');
  assert.equal(initTabs(), 'overview', 'the un-hidden panel is the active tab');
});

test('onClick resolves the nearest matching ancestor, not the raw target', async (t) => {
  const teardown = installDom();
  t.after(teardown);

  const { onClick } = await import('../assets/js/lib/dom.js');
  assert.equal(typeof onClick, 'function');

  // A click target deep inside a button must still resolve to the button.
  const button = { id: 'btn' };
  const deepTarget = new globalThis.Element();
  deepTarget.closest = (selector) => (selector === 'button[data-action]' ? button : null);

  // Drive the delegation contract directly: the document stub records listeners,
  // so we invoke the registered handler with a nested target.
  let registered = null;
  document.addEventListener = (type, fn) => {
    if (type === 'click') registered = fn;
  };

  onClick('button[data-action]', (element) => {
    capturedId = element.id;
  });

  let capturedId = null;
  registered({ target: deepTarget });

  assert.equal(capturedId, 'btn', 'handler receives the resolved button, not the inner node');
});

test('attr escapes quotes so values cannot break out of an attribute', async () => {
  const { attr } = await import('../assets/js/lib/dom.js');
  assert.equal(attr('" onmouseover="alert(1)'), '&quot; onmouseover=&quot;alert(1)');
  assert.equal(attr(null), '');
});
