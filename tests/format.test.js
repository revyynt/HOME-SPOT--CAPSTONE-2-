import test from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml,
  formatPHP,
  toCentavos,
  initials,
  avatarGradient,
  getUrlParam,
  deduplicatePayments,
  formatPaymentMethod,
  getPaymentFailureReason
} from '../assets/js/lib/format.js';

test('escapeHtml neutralises every HTML-significant character', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('"quoted"'), '&quot;quoted&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml defuses stored-XSS payloads that reach the UI', () => {
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

test('deduplicatePayments collapses provider webhook and client redirect duplicates', () => {
  const records = [
    {
      id: 'pay_001',
      tenantName: 'Juan Dela Cruz',
      tenantEmail: 'juan.delacruz@gmail.com',
      amount: 500,
      purpose: 'Parking Space Fee - MJP Residences',
      status: 'Paid',
      createdAt: '2026-10-24T10:00:00Z'
    },
    {
      id: 'cs_001',
      tenantName: 'Juan Dela Cruz',
      tenantEmail: 'juan.delacruz@gmail.com',
      amount: 500,
      purpose: 'Parking Space Fee',
      status: 'Paid',
      createdAt: '2026-10-24T10:00:05Z'
    },
    {
      id: 'pay_002',
      tenantName: 'Juan Dela Cruz',
      tenantEmail: 'juan.delacruz@gmail.com',
      amount: 1000,
      purpose: 'Monthly Rent',
      status: 'Paid',
      createdAt: '2026-10-24T11:00:00Z'
    },
    {
      id: 'cs_002',
      tenantName: 'Juan Dela Cruz',
      tenantEmail: 'juan.delacruz@gmail.com',
      amount: 1000,
      purpose: 'Monthly Rent - MJP Residences',
      status: 'Paid',
      createdAt: '2026-10-24T11:00:02Z'
    },
    {
      id: 'pay_003',
      tenantName: 'Juan Dela Cruz',
      tenantEmail: 'juan.delacruz@gmail.com',
      amount: 1200,
      purpose: 'Monthly Rent',
      status: 'Paid',
      createdAt: '2026-10-18T10:00:00Z'
    }
  ];

  const result = deduplicatePayments(records);
  assert.equal(result.length, 3);
  assert.equal(result[0].purpose, 'Parking Space Fee');
  assert.equal(result[1].purpose, 'Monthly Rent');
  assert.equal(result[2].amount, 1200);
});

test('formatPaymentMethod formats PayMongo channels into specific labels', () => {
  assert.equal(formatPaymentMethod('gcash'), 'PayMongo Checkout (GCash)');
  assert.equal(formatPaymentMethod('paymaya'), 'PayMongo Checkout (Maya)');
  assert.equal(formatPaymentMethod('qrph'), 'PayMongo Checkout (QR Ph)');
  assert.equal(formatPaymentMethod('card'), 'PayMongo Checkout (Card)');
  assert.equal(formatPaymentMethod('grab_pay'), 'PayMongo Checkout (GrabPay)');
  assert.equal(
    formatPaymentMethod('PayMongo Checkout', {
      attributes: { payment_method_used: 'gcash' }
    }),
    'PayMongo Checkout (GCash)'
  );
  assert.equal(
    formatPaymentMethod('PayMongo Checkout', {
      attributes: { payments: [{ attributes: { source: { type: 'qrph' } } }] }
    }),
    'PayMongo Checkout (QR Ph)'
  );
  assert.equal(formatPaymentMethod('PayMongo Checkout'), 'PayMongo Checkout');
});
test('getPaymentFailureReason resolves failure reasons tailored to the payment channel', () => {
  assert.equal(
    getPaymentFailureReason(null, 'PayMongo Checkout (GCash)'),
    'GCash authorization failed, was declined, or expired on PayMongo.'
  );
  assert.equal(
    getPaymentFailureReason(null, 'PayMongo Checkout (Maya)'),
    'Maya authorization failed, was declined, or expired on PayMongo.'
  );
  assert.equal(
    getPaymentFailureReason(null, 'PayMongo Checkout (QR Ph)'),
    'QR Ph payment was cancelled, expired, or declined on PayMongo.'
  );
  assert.equal(
    getPaymentFailureReason(null, 'PayMongo Checkout (Card)'),
    'Card was declined or 3DS verification failed on PayMongo.'
  );
  assert.equal(
    getPaymentFailureReason({
      attributes: {
        payment_intent: {
          attributes: {
            last_payment_error: { failed_message: 'Insufficient balance in e-wallet' }
          }
        }
      }
    }, 'PayMongo Checkout (GCash)'),
    'Insufficient balance in e-wallet'
  );
});

