import test from 'node:test';
import assert from 'node:assert/strict';

import { settledTotal, computeAmountDue, paymentStatusFor } from '../lib/ledger.js';

const paid = (amount, over = {}) => ({ status: 'Paid', amount, ...over });

test('settledTotal counts only Paid money', () => {
  assert.equal(
    settledTotal([
      paid(5000),
      paid(2500),
      { status: 'Failed', amount: 9000 },
      { status: 'Pending', amount: 9000 }
    ]),
    7500
  );
});

test('settledTotal ignores junk without throwing', () => {
  assert.equal(settledTotal([null, paid('nonsense'), { status: 'Paid' }, { amount: 100 }]), 0);
  assert.equal(settledTotal(null), 0);
});

test('status matching is case and whitespace insensitive', () => {
  assert.equal(settledTotal([{ status: ' paid ', amount: 100 }]), 100);
});

test('a full payment settles the balance to zero', () => {
  assert.equal(computeAmountDue({ baseline: 5000, payments: [paid(5000)] }), 0);
});

test('a partial payment leaves the remainder due', () => {
  assert.equal(computeAmountDue({ baseline: 5000, payments: [paid(2000)] }), 3000);
});

test('no payments leaves the full rent due', () => {
  assert.equal(computeAmountDue({ baseline: 5000, payments: [] }), 5000);
});

test('a duplicate delivery does not double-count', () => {
  // Recomputing from the ledger (rather than decrementing) is what makes a
  // retried webhook harmless: the same payment doc is summed once.
  const ledger = [paid(5000)];
  assert.equal(computeAmountDue({ baseline: 5000, payments: ledger }), 0);
  assert.equal(computeAmountDue({ baseline: 5000, payments: ledger }), 0);
});

test('a failed payment never reduces the balance', () => {
  assert.equal(
    computeAmountDue({
      baseline: 5000,
      payments: [paid(5000), { status: 'Failed', amount: 5000 }]
    }),
    0
  );
});

test('a voided payment restores the balance that had been reduced', () => {
  // First webhook: paid -> settled. Later the payment is voided, so the record
  // flips to Failed and the tenant owes the rent again.
  const before = computeAmountDue({ baseline: 5000, payments: [paid(5000)] });
  assert.equal(before, 0);
  const after = computeAmountDue({
    baseline: 5000,
    payments: [{ status: 'Failed', amount: 5000 }]
  });
  assert.equal(after, 5000);
});

test('a refund larger than the rent floors at zero, never negative', () => {
  const due = computeAmountDue({ baseline: 5000, payments: [paid(9000)] });
  assert.equal(due, 0);
  assert.ok(due >= 0);
});

test('payments from different cycles are not mixed', () => {
  // The caller scopes the ledger to one cycle; this documents the contract the
  // webhook relies on when it queries payments for the tenant.
  const cycleOne = [paid(5000)];
  assert.equal(computeAmountDue({ baseline: 5000, payments: cycleOne }), 0);
  assert.equal(computeAmountDue({ baseline: 5000, payments: [] }), 5000);
});

test('a missing or unusable baseline yields zero rather than NaN', () => {
  assert.equal(computeAmountDue({ baseline: null, payments: [paid(100)] }), 0);
  assert.equal(computeAmountDue({ baseline: 'abc', payments: [] }), 0);
  assert.equal(computeAmountDue({ baseline: -5, payments: [] }), 0);
  assert.equal(computeAmountDue({ payments: [paid(100)] }), 0);
});

test('paymentStatusFor flips to Paid only at zero', () => {
  assert.equal(paymentStatusFor(0), 'Paid');
  assert.equal(paymentStatusFor(0.01), 'Pending');
  assert.equal(paymentStatusFor(5000), 'Pending');
});
