import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VERIFICATION,
  decideVerification,
  isMatchFor,
  confirmedTotal,
  resolveAmountDue,
  toMillis,
  windowMs
} from '../assets/js/lib/payment-verification.js';

const NOW = 1767225600000; // fixed clock
const DAY = 24 * 60 * 60 * 1000;

const ATTEMPT = {
  tenantEmail: 'tenant@example.com',
  amount: 5000,
  startedAtMs: NOW
};

const paid = (over = {}) => ({
  tenantEmail: 'tenant@example.com',
  amount: 5000,
  status: 'Paid',
  timestamp: new Date(NOW + 60_000).toISOString(),
  ...over
});

test('toMillis handles ISO strings, epoch millis, and Firestore Timestamps', () => {
  assert.equal(toMillis(NOW), NOW);
  assert.equal(toMillis(new Date(NOW).toISOString()), NOW);
  assert.equal(toMillis({ seconds: NOW / 1000 }), NOW);
  assert.equal(toMillis(new Date(NOW)), NOW);
  assert.equal(toMillis(null), null);
  assert.equal(toMillis('not-a-date'), null);
  assert.equal(toMillis(undefined), null);
});

test('a forged redirect with no server record stays PENDING', () => {
  // This is the exploit the module exists to close: the tenant types
  // ?payment=success by hand. Nothing in `payments` corroborates it.
  const result = decideVerification({ attempt: ATTEMPT, serverPayments: [] });
  assert.equal(result.state, VERIFICATION.PENDING);
  assert.equal(result.match, null);
});

test('a matching paid record confirms the attempt', () => {
  const result = decideVerification({ attempt: ATTEMPT, serverPayments: [paid()] });
  assert.equal(result.state, VERIFICATION.CONFIRMED);
  assert.equal(result.match.amount, 5000);
});

test('a payment for a different tenant never confirms', () => {
  const result = decideVerification({
    attempt: ATTEMPT,
    serverPayments: [paid({ tenantEmail: 'attacker@example.com' })]
  });
  assert.equal(result.state, VERIFICATION.PENDING);
});

test('a payment for a different amount never confirms', () => {
  // Paying 1 peso must not settle a 5000 peso balance.
  const result = decideVerification({
    attempt: ATTEMPT,
    serverPayments: [paid({ amount: 1 })]
  });
  assert.equal(result.state, VERIFICATION.PENDING);
});

test('an unrelated old payment cannot confirm a fresh attempt', () => {
  // Same email, same amount, but settled weeks before this checkout started.
  const result = decideVerification({
    attempt: ATTEMPT,
    serverPayments: [paid({ timestamp: new Date(NOW - 30 * DAY).toISOString() })]
  });
  assert.equal(result.state, VERIFICATION.PENDING);
});

test('a webhook that lags slightly still matches inside the window', () => {
  const result = decideVerification({
    attempt: ATTEMPT,
    serverPayments: [paid({ timestamp: new Date(NOW + 90 * 60 * 1000).toISOString() })]
  });
  assert.equal(result.state, VERIFICATION.CONFIRMED);
});

test('a failure is reported when no payment was taken', () => {
  const result = decideVerification({
    attempt: ATTEMPT,
    serverPayments: [paid({ status: 'Failed', failureCode: 'card_declined' })]
  });
  assert.equal(result.state, VERIFICATION.FAILED);
});

test('a later success wins over an earlier failure for the same attempt', () => {
  // PayMongo can fail an early attempt on a session that later succeeds. The
  // payer must not be shown "failed" for money that was actually taken.
  const result = decideVerification({
    attempt: ATTEMPT,
    serverPayments: [
      paid({ status: 'Failed', timestamp: new Date(NOW).toISOString() }),
      paid({ timestamp: new Date(NOW + 60_000).toISOString() })
    ]
  });
  assert.equal(result.state, VERIFICATION.CONFIRMED);
});

test('no attempt means nothing to verify', () => {
  assert.equal(decideVerification({ attempt: null }).state, VERIFICATION.NONE);
});

test('a missing array does not throw', () => {
  assert.equal(decideVerification({ attempt: ATTEMPT }).state, VERIFICATION.PENDING);
  assert.equal(
    decideVerification({ attempt: ATTEMPT, serverPayments: null }).state,
    VERIFICATION.PENDING
  );
});

test('an attempt with no timestamp cannot be matched at all', () => {
  // Without a start time there is no window to judge, so fail closed.
  const match = isMatchFor({ tenantEmail: 'a@b.c', amount: 5000 }, paid());
  assert.equal(match, false);
});

test('confirmedTotal sums only Paid records and ignores junk', () => {
  const total = confirmedTotal([
    paid({ amount: 5000 }),
    paid({ amount: 2500 }),
    paid({ amount: 999, status: 'Failed' }),
    paid({ amount: 'nonsense' }),
    null
  ]);
  assert.equal(total, 7500);
  assert.equal(confirmedTotal(null), 0);
});

test('an explicit server balance wins over the confirmed total', () => {
  const result = resolveAmountDue({
    rent: 5000,
    serverPayments: [paid({ amount: 5000 })],
    explicitAmountDue: 1200
  });
  assert.deepEqual(result, { due: 1200, source: 'explicit' });
});

test('without an explicit balance the due is rent minus confirmed payments', () => {
  const result = resolveAmountDue({ rent: 5000, serverPayments: [paid({ amount: 2000 })] });
  assert.deepEqual(result, { due: 3000, source: 'confirmed-total' });
});

test('overpayment never produces a negative balance', () => {
  const result = resolveAmountDue({ rent: 5000, serverPayments: [paid({ amount: 9000 })] });
  assert.equal(result.due, 0);
});

test('with nothing recorded the full rent is due', () => {
  assert.deepEqual(resolveAmountDue({ rent: 5000, serverPayments: [] }), {
    due: 5000,
    source: 'rent'
  });
});

test('an explicit balance of 0 is honoured, not treated as absent', () => {
  // 0 is falsy; treating it as "unset" would resurrect a settled account's
  // balance from the rent default.
  const result = resolveAmountDue({ rent: 5000, explicitAmountDue: 0 });
  assert.deepEqual(result, { due: 0, source: 'explicit' });
});

test('windowMs defaults to a day and ignores nonsense', () => {
  assert.equal(windowMs(), DAY);
  assert.equal(windowMs(1), 60 * 60 * 1000);
  assert.equal(windowMs('abc'), 0);
  assert.equal(windowMs(-5), 0);
});
