import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCENARIO,
  resolveReturnScenario,
  interpretPaymentIntent,
  interpretCheckoutSession,
  buildReturnRecord,
  shouldExpireSession
} from '../assets/js/lib/payment-return.js';

const NOW = 1767225600000; // fixed clock so reference numbers are assertable

test('no params and no pending record is a no-op', () => {
  const s = resolveReturnScenario({ search: '', pending: null, now: NOW });
  assert.equal(s.kind, SCENARIO.NONE);
  assert.equal(s.clearPending, false);
  assert.equal(s.stripUrl, false);
});

test('declined 3DS with no URL params is recovered from the pending sessionId', () => {
  // This is the real-world case: PayMongo does not always redirect to cancel_url.
  const s = resolveReturnScenario({
    search: '',
    pending: { sessionId: 'cs_abc123', amount: 5000, purpose: 'Monthly Rent' },
    now: NOW
  });

  assert.equal(s.kind, SCENARIO.PENDING_SESSION);
  assert.equal(s.sessionId, 'cs_abc123');
  assert.equal(s.clearPending, true);
  assert.equal(s.targetTab, 'payment');
  assert.equal(s.base.amount, 5000);
});

test('pending-session branch does not let a stale URL amount override the record', () => {
  // Preserves the original behaviour: this branch reads amount from `pending`.
  const s = resolveReturnScenario({
    search: '?amount=9999',
    pending: { sessionId: 'cs_abc123', amount: 5000 },
    now: NOW
  });
  assert.equal(s.kind, SCENARIO.PENDING_SESSION);
  assert.equal(s.base.amount, 5000);
});

test('3DS return is detected from the payment_intent_id param', () => {
  const s = resolveReturnScenario({
    search: '?payment_intent_id=pi_1234567890',
    pending: null,
    now: NOW
  });

  assert.equal(s.kind, SCENARIO.CARD_3DS);
  assert.equal(s.paymentIntentId, 'pi_1234567890');
  assert.equal(s.base.referenceNumber, 'PM-CARD-567890');
});

test('a pending paymentIntentId is used when PayMongo returns with no params', () => {
  const s = resolveReturnScenario({
    search: '',
    pending: { paymentIntentId: 'pi_abcdefghij' },
    now: NOW
  });

  assert.equal(s.kind, SCENARIO.CARD_3DS);
  assert.equal(s.paymentIntentId, 'pi_abcdefghij');
});

test('payment_intent_id is recovered from a raw href when URLSearchParams misses it', () => {
  const s = resolveReturnScenario({
    search: '',
    href: 'https://localhost/tenant-portal.html?payment_intent_id=pi_rawlookup1',
    pending: null,
    now: NOW
  });
  assert.equal(s.kind, SCENARIO.CARD_3DS);
  assert.equal(s.paymentIntentId, 'pi_rawlookup1');
});

test('hosted checkout success is recognised', () => {
  const s = resolveReturnScenario({
    search: '?payment=success&amount=5000&purpose=Monthly%20Rent',
    pending: { sessionId: 'cs_ok123' },
    now: NOW
  });

  assert.equal(s.kind, SCENARIO.HOSTED_SUCCESS);
  assert.equal(s.sessionId, 'cs_ok123');
  assert.equal(s.base.amount, 5000);
  assert.equal(s.base.purpose, 'Monthly Rent');
});

test('hosted checkout failure and cancellation are both failures', () => {
  for (const status of ['failed', 'cancelled']) {
    const s = resolveReturnScenario({
      search: `?payment=${status}`,
      pending: { sessionId: 'cs_bad123' },
      now: NOW
    });
    assert.equal(s.kind, SCENARIO.HOSTED_FAILED, `payment=${status}`);
    assert.equal(s.sessionId, 'cs_bad123');
    assert.match(s.base.referenceNumber, /^PM-FAIL-/);
  }
});

test('an unrecognised payment status is a no-op rather than a silent success', () => {
  const s = resolveReturnScenario({
    search: '?payment=totally_unknown',
    pending: { sessionId: 'cs_x' },
    now: NOW
  });
  assert.equal(s.kind, SCENARIO.NONE);
  assert.equal(s.clearPending, false);
});

test('URL amount wins over the pending record for the param-driven scenarios', () => {
  const s = resolveReturnScenario({
    search: '?payment=success&amount=7500',
    pending: { amount: 5000 },
    now: NOW
  });
  assert.equal(s.base.amount, 7500);
});

test('amount falls back to pending, then to the 5000 default', () => {
  const withPending = resolveReturnScenario({
    search: '?payment=success',
    pending: { amount: 4500 },
    now: NOW
  });
  assert.equal(withPending.base.amount, 4500);

  const withNeither = resolveReturnScenario({
    search: '?payment=success',
    pending: null,
    now: NOW
  });
  assert.equal(withNeither.base.amount, 5000);
});

test('pending notes and method override the generic defaults', () => {
  const s = resolveReturnScenario({
    search: '?payment=success',
    pending: { notes: 'June rent', method: 'GCash' },
    now: NOW
  });
  assert.equal(s.base.notes, 'June rent');
  assert.equal(s.base.method, 'GCash');
});

test('interpretPaymentIntent treats only "succeeded" as success', () => {
  assert.deepEqual(interpretPaymentIntent({ attributes: { status: 'succeeded' } }), {
    isSuccess: true,
    status: 'succeeded',
    failureDetail: null
  });

  for (const status of ['awaiting_payment_method', 'requires_action', 'failed']) {
    assert.equal(
      interpretPaymentIntent({ attributes: { status } }).isSuccess,
      false,
      `${status} must not count as paid`
    );
  }
});

test('interpretPaymentIntent surfaces the gateway failure message', () => {
  const result = interpretPaymentIntent({
    attributes: {
      status: 'failed',
      last_payment_error: { failed_message: 'Your card was declined.' }
    }
  });
  assert.equal(result.failureDetail, 'Your card was declined.');
});

test('interpretPaymentIntent fails closed when the API returns nothing', () => {
  const result = interpretPaymentIntent(null);
  assert.equal(result.isSuccess, false);
  assert.ok(result.failureDetail);
});

test('interpretCheckoutSession reports paid and preserves the failure detail', () => {
  const paid = interpretCheckoutSession({ attributes: { status: 'paid' } });
  assert.equal(paid.status, 'paid');

  const declined = interpretCheckoutSession({
    attributes: {
      status: 'failed',
      payment_intent: { attributes: { last_payment_error: { detail: 'Insufficient funds' } } }
    }
  });
  assert.equal(declined.failureDetail, 'Insufficient funds');
});

test('interpretCheckoutSession defaults to failed semantics on missing data', () => {
  const result = interpretCheckoutSession(null);
  assert.equal(result.status, null);
  assert.ok(result.failureDetail, 'must never report an empty failure reason');
});

test('buildReturnRecord produces a Paid record without a failureReason key', () => {
  const scenario = resolveReturnScenario({ search: '?payment=success', now: NOW });
  const record = buildReturnRecord(scenario, {
    status: 'Paid',
    tenantEmail: 'ana@example.com',
    now: NOW
  });

  assert.equal(record.status, 'Paid');
  assert.equal(record.tenantEmail, 'ana@example.com');
  assert.ok(!('failureReason' in record), 'Paid records must not carry a failureReason');
  assert.ok(record.dateFormatted);
});

test('buildReturnRecord always includes failureReason on failure', () => {
  const scenario = resolveReturnScenario({
    search: '?payment=failed',
    pending: { sessionId: 'cs_x' },
    now: NOW
  });
  const record = buildReturnRecord(scenario, {
    status: 'Failed',
    failureReason: 'Card declined',
    now: NOW
  });

  assert.equal(record.status, 'Failed');
  assert.equal(record.failureReason, 'Card declined');
});

test('buildReturnRecord never fabricates a reference number', () => {
  const scenario = resolveReturnScenario({ search: '?payment=success', now: NOW });
  const record = buildReturnRecord(scenario, { status: 'Paid', now: NOW });
  assert.ok(record.referenceNumber, 'referenceNumber must always be populated');
  assert.ok(!record.referenceNumber.includes('undefined'));
  assert.ok(!record.referenceNumber.includes('null'));
});

test('buildReturnRecord fills amount and purpose from the scenario', () => {
  const scenario = resolveReturnScenario({
    search: '?payment=success&amount=2500&purpose=Utilities',
    now: NOW
  });
  const record = buildReturnRecord(scenario, { status: 'Paid', now: NOW });
  assert.equal(record.amount, 2500);
  assert.equal(record.purpose, 'Utilities');
});

test('shouldExpireSession only fires for the two session-based scenarios', () => {
  assert.equal(shouldExpireSession(SCENARIO.PENDING_SESSION, 'failed'), true);
  assert.equal(shouldExpireSession(SCENARIO.HOSTED_FAILED, 'failed'), true);
  assert.equal(shouldExpireSession(SCENARIO.PENDING_SESSION, 'expired'), false);
  assert.equal(shouldExpireSession(SCENARIO.CARD_3DS, 'failed'), false);
  assert.equal(shouldExpireSession(SCENARIO.HOSTED_SUCCESS, 'paid'), false);
});

test('a checkout session reporting "paid" is never treated as a failure', () => {
  const scenario = resolveReturnScenario({
    search: '',
    pending: { sessionId: 'cs_paid' },
    now: NOW
  });
  const { status, failureDetail } = interpretCheckoutSession({
    attributes: { status: 'paid' }
  });

  assert.equal(status, 'paid');
  assert.equal(scenario.kind, SCENARIO.PENDING_SESSION);
  // A paid session must not carry any failure narrative.
  assert.equal(failureDetail, null);
});
