import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQrPhPayload, qrImageUrl } from '../assets/js/lib/qr.js';

test('buildQrPhPayload emits a well-formed EMVCo string', () => {
  const payload = buildQrPhPayload({
    amount: 5000,
    reference: 'PM-RET-123456',
    merchant: 'MJP RESIDENCES'
  });

  assert.ok(payload.startsWith('000201'), 'must start with the payload format indicator');
  assert.ok(payload.endsWith('6304'), 'must end with the CRC tag');
  assert.ok(payload.includes('ph.paymongo'));
  assert.ok(payload.includes('5303608'), 'PHP currency code');
  assert.ok(payload.includes('5802PH'), 'country code');
});

test('the transaction amount is pesos, not centavos', () => {
  const payload = buildQrPhPayload({ amount: 5000, reference: 'ref' });
  // "5000.00" is 7 characters, so the tag is 54 + len(07) + value.
  assert.ok(payload.includes('54075000.00'), 'expected 54 + len(7) + 5000.00');
  assert.ok(!payload.includes('500000.00'), 'must not send centavos');
});

test('the amount field is length-prefixed correctly for multi-digit values', () => {
  const payload = buildQrPhPayload({ amount: 123456.78, reference: 'ref' });
  assert.ok(payload.includes('5409123456.78'));
});

test('a non-numeric amount degrades to 0.00 rather than NaN', () => {
  const payload = buildQrPhPayload({ amount: 'garbage', reference: 'ref' });
  assert.ok(payload.includes('54040.00'));
  assert.ok(!payload.includes('NaN'));
});

test('reference and merchant are truncated to their EMVCo field limits', () => {
  const payload = buildQrPhPayload({
    amount: 100,
    reference: 'x'.repeat(80),
    merchant: 'y'.repeat(80)
  });
  assert.ok(!payload.includes('x'.repeat(30)), 'reference must be truncated');
  assert.ok(!payload.includes('y'.repeat(30)), 'merchant must be truncated');
});

test('qrImageUrl encodes the payload', () => {
  const url = qrImageUrl({ amount: 5000, reference: 'ref' });
  assert.ok(url.startsWith('https://api.qrserver.com/'));
  assert.ok(url.includes('data='));
  assert.ok(!url.includes(' '), 'payload must be URL-encoded');
});

test('the same inputs always produce the same payload', () => {
  const a = buildQrPhPayload({ amount: 5000, reference: 'ref' });
  const b = buildQrPhPayload({ amount: 5000, reference: 'ref' });
  assert.equal(a, b);
});
