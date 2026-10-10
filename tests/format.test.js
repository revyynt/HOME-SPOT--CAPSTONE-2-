import test from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml,
  formatPHP,
  toCentavos,
  initials,
  avatarGradient,
  getUrlParam
} from '../assets/js/lib/format.js';

test('escapeHtml neutralises every HTML-significant character', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('"quoted"'), '&quot;quoted&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml defuses the stored-XSS payloads that reach Firestore', () => {
  // A tenant name is attacker-controllable via the admin form.
  const payload = '<img src=x onerror=fetch("//evil")>';
  assert.ok(!escapeHtml(payload).includes('<img'));

  const attrBreakout = '" onmouseover="alert(1)';
  const escaped = escapeHtml(attrBreakout);
  assert.ok(!escaped.includes('"'), 'must not leave a raw double quote');
  assert.ok(escaped.includes('&quot;'));
});

test('escapeHtml handles null and undefined without producing "undefined"', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
});

test('escapeHtml preserves existing ampersand ordering (no double-encoding)', () => {
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('formatPHP renders pesos', () => {
  const out = formatPHP(5000);
  assert.match(out, /5,000\.00/);
  assert.match(out, /₱|PHP/);
});

test('formatPHP degrades gracefully on junk input', () => {
  assert.match(formatPHP(undefined), /0\.00/);
  assert.match(formatPHP('not a number'), /0\.00/);
  assert.match(formatPHP(null), /0\.00/);
});

test('toCentavos converts pesos to centavos', () => {
  assert.equal(toCentavos(5000), 500000);
  assert.equal(toCentavos('5000'), 500000);
  assert.equal(toCentavos(5000.55), 500055);
  assert.equal(toCentavos(0.1), 10);
});

test('initials produces up to two uppercase letters', () => {
  assert.equal(initials('Ana Garcia'), 'AG');
  assert.equal(initials('Ana Maria Garcia'), 'AM');
  assert.equal(initials('Cher'), 'C');
  assert.equal(initials(''), 'T');
  assert.equal(initials(null), 'T');
});

test('avatarGradient is deterministic and bounded', () => {
  const first = avatarGradient('Ana Garcia');
  assert.equal(avatarGradient('Ana Garcia'), first, 'same input must give same gradient');

  const known = [
    'from-blue-600 to-indigo-600',
    'from-emerald-600 to-teal-600',
    'from-purple-600 to-pink-600',
    'from-amber-600 to-orange-600',
    'from-rose-600 to-red-600',
    'from-cyan-600 to-blue-600'
  ];
  for (const name of ['a', 'Ana', 'Juan Dela Cruz', '', 'x'.repeat(50)]) {
    assert.ok(known.includes(avatarGradient(name)), `unexpected gradient for "${name}"`);
  }
});

test('getUrlParam reads query parameters', () => {
  assert.equal(getUrlParam('id', '?id=4'), '4');
  assert.equal(getUrlParam('missing', '?id=4'), null);
  assert.equal(getUrlParam('payment', '?payment=success&amount=5000'), 'success');
});
