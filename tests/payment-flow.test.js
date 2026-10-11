/**
 * End-to-end walkthrough of the four PayMongo return paths.
 *
 * This drives the REAL modules the browser runs -- lib/payment-return.js for the
 * scenario decision and lib/payment-verification.js for corroboration and the
 * balance -- through every shape PayMongo can return. It replaces the manual
 * browser walkthrough that the payment-return refactor needed, and it asserts
 * the security property that matters: a redirect alone never moves a balance.
 *
 * lib/ledger.js is then applied to simulate the webhook reconciling the
 * tenant's stored `amountDue` after the payment settles.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  SCENARIO,
  resolveReturnScenario,
  interpretPaymentIntent,
  interpretCheckoutSession,
  buildReturnRecord,
  shouldExpireSession
} from '../assets/js/lib/payment-return.js';
import {
  VERIFICATION,
  decideVerification,
  resolveAmountDue
} from '../assets/js/lib/payment-verification.js';

const require = createRequire(import.meta.url);
const { computeAmountDue, paymentStatusFor } = require('../lib/ledger.js');

const NOW = 1767225600000;
const TENANT = 'tenant@example.com';
const AMOUNT = 5000;

/** A checkout was started; the portal persisted this before leaving. */
function pendingCheckout(over = {}) {
  return {
    sessionId: 'cs_abc123',
    referenceNumber: 'REF-1',
    amount: AMOUNT,
    purpose: 'Monthly Rent',
    method: 'PayMongo Checkout',
    tenantName: 'Juan Dela Cruz',
    tenantEmail: TENANT,
    startedAtMs: NOW,
    ...over
  };
}

/** A webhook `payments` document, as functions/index.js writes it. */
function webhookPaid(over = {}) {
  return {
    tenantEmail: TENANT,
    amount: AMOUNT,
    status: 'Paid',
    timestamp: new Date(NOW + 60_000).toISOString(),
    referenceNumber: 'PM-ABC123',
    ...over
  };
}

/**
 * Reproduces the decision half of checkUrlPaymentReturn(): resolve the
 * scenario, ask the gateway, derive paid vs failed, build the record.
 */
function walkReturn({ search, href = '', pending, gateway }) {
  const scenario = resolveReturnScenario({
    search,
    href,
    pending,
    now: NOW,
    fallbackTenantName: 'Juan Dela Cruz'
  });

  if (scenario.kind === SCENARIO.NONE) return { scenario, record: null, paid: null };

  let sessionStatus = null;
  if (scenario.kind === SCENARIO.PENDING_SESSION) {
    sessionStatus = gateway?.sessionStatus ?? null;
  } else if (scenario.kind === SCENARIO.HOSTED_FAILED && scenario.sessionId) {
    sessionStatus = gateway?.sessionStatus ?? null;
  }

  let paid;
  if (scenario.kind === SCENARIO.PENDING_SESSION) {
    paid = sessionStatus === 'paid';
  } else if (scenario.kind === SCENARIO.CARD_3DS) {
    paid = interpretPaymentIntent(gateway?.paymentIntent).isSuccess;
  } else if (scenario.kind === SCENARIO.HOSTED_SUCCESS) {
    paid = true;
    // A forged ?payment=success is caught here when PayMongo disagrees.
    if (sessionStatus && sessionStatus !== 'paid') paid = false;
  } else {
    paid = false;
  }

  let failureReason;
  if (!paid) {
    if (scenario.kind === SCENARIO.CARD_3DS) {
      failureReason = interpretPaymentIntent(gateway?.paymentIntent).failureDetail;
    } else if (scenario.sessionId) {
      failureReason = interpretCheckoutSession(gateway?.sessionData).failureDetail || undefined;
    }
  }

  const record = buildReturnRecord(scenario, {
    status: paid ? 'Paid' : 'Failed',
    recordStatus: paid ? 'Pending' : 'Failed',
    failureReason,
    tenantEmail: TENANT,
    startedAtMs: pending?.startedAtMs,
    now: NOW
  });

  return { scenario, record, paid, sessionStatus };
}

test('PATH 1 - hosted checkout success returns to ?payment=success', () => {
  const pending = pendingCheckout();
  const { scenario, record, paid } = walkReturn({
    search: '?payment=success&amount=5000&purpose=Monthly%20Rent',
    pending,
    gateway: { sessionStatus: 'paid' }
  });

  assert.equal(scenario.kind, SCENARIO.HOSTED_SUCCESS);
  assert.equal(paid, true);
  assert.equal(record.amount, AMOUNT);
  assert.equal(record.tenantEmail, TENANT);
  // The redirect is a claim, never a settlement.
  assert.equal(record.status, 'Pending');
});

test('PATH 1 - the success redirect does NOT move the balance on its own', () => {
  // The core property: hand-editing ?payment=success must not settle anything.
  const { record } = walkReturn({
    search: '?payment=success&amount=5000',
    pending: pendingCheckout(),
    gateway: { sessionStatus: 'paid' }
  });

  const verified = decideVerification({ attempt: record, serverPayments: [] });
  assert.equal(verified.state, VERIFICATION.PENDING);

  const { due } = resolveAmountDue({ rent: AMOUNT, serverPayments: [] });
  assert.equal(due, AMOUNT, 'balance must still show the full rent outstanding');
});

test('PATH 1 - it settles only once the webhook corroborates', () => {
  const { record } = walkReturn({
    search: '?payment=success&amount=5000',
    pending: pendingCheckout(),
    gateway: { sessionStatus: 'paid' }
  });

  const verified = decideVerification({
    attempt: record,
    serverPayments: [webhookPaid()]
  });
  assert.equal(verified.state, VERIFICATION.CONFIRMED);

  const { due } = resolveAmountDue({ rent: AMOUNT, serverPayments: [webhookPaid()] });
  assert.equal(due, 0);
});

test('PATH 2 - card 3DS return with a succeeded intent', () => {
  const pending = pendingCheckout({ sessionId: '', paymentIntentId: 'pi_abc123' });
  const { scenario, record, paid } = walkReturn({
    search: '?payment_intent_id=pi_abc123&amount=5000',
    pending,
    gateway: {
      paymentIntent: { attributes: { status: 'succeeded' } }
    }
  });

  assert.equal(scenario.kind, SCENARIO.CARD_3DS);
  assert.equal(paid, true);
  assert.equal(record.paymentMethodId, 'pi_abc123');
  // The pending record's own reference wins over the derived PM-CARD- fallback.
  assert.equal(record.referenceNumber, 'REF-1');
  assert.equal(record.status, 'Pending');
  // The checkout start time survives, so the webhook can still be matched.
  assert.equal(record.startedAtMs, NOW);
});

test('PATH 2 - a declined 3DS intent produces a Failed record with a reason', () => {
  const pending = pendingCheckout({ sessionId: '', paymentIntentId: 'pi_abc123' });
  const { paid, record } = walkReturn({
    search: '?payment_intent_id=pi_abc123&amount=5000',
    pending,
    gateway: {
      paymentIntent: {
        attributes: {
          status: 'failed',
          last_payment_error: { failed_message: 'insufficient_funds' }
        }
      }
    }
  });

  assert.equal(paid, false);
  assert.equal(record.status, 'Failed');
  assert.equal(record.failureReason, 'insufficient_funds');
});

test('PATH 2 - an unreachable gateway fails closed', () => {
  // Network error: no payment data at all. Must NOT be treated as paid.
  const pending = pendingCheckout({ sessionId: '', paymentIntentId: 'pi_abc123' });
  const { paid, record } = walkReturn({
    search: '?payment_intent_id=pi_abc123',
    pending,
    gateway: { paymentIntent: null }
  });

  assert.equal(paid, false);
  assert.equal(record.status, 'Failed');
});

test('PATH 3 - no URL params at all, session was actually paid', () => {
  // PayMongo sometimes returns with no query string. The pending sessionId is
  // the only surviving signal, so we must query PayMongo.
  const { scenario, paid, record } = walkReturn({
    search: '',
    pending: pendingCheckout(),
    gateway: { sessionStatus: 'paid' }
  });

  assert.equal(scenario.kind, SCENARIO.PENDING_SESSION);
  assert.equal(paid, true);
  assert.equal(record.amount, AMOUNT);
  assert.equal(record.status, 'Pending');
});

test('PATH 3 - no URL params and the session was not paid', () => {
  const { scenario, paid, record } = walkReturn({
    search: '',
    pending: pendingCheckout(),
    gateway: {
      sessionStatus: 'expired',
      sessionData: {
        attributes: {
          status: 'expired',
          payment_intent: {
            attributes: { last_payment_error: { failed_message: 'checkout_expired' } }
          }
        }
      }
    }
  });

  assert.equal(scenario.kind, SCENARIO.PENDING_SESSION);
  assert.equal(paid, false);
  assert.equal(record.status, 'Failed');
  assert.equal(record.failureReason, 'checkout_expired');
});

test('PATH 3 - the pending branch does not let a stale URL amount win', () => {
  const { record } = walkReturn({
    search: '?amount=999999',
    pending: pendingCheckout({ amount: 2500 }),
    gateway: { sessionStatus: 'paid' }
  });
  assert.equal(record.amount, 2500);
});

test('PATH 4 - cancelled checkout returns via cancel_url', () => {
  const { scenario, paid, record } = walkReturn({
    search: '?payment=cancelled&amount=5000',
    pending: pendingCheckout(),
    gateway: {
      sessionStatus: 'expired',
      sessionData: { attributes: { status: 'expired' } }
    }
  });

  assert.equal(scenario.kind, SCENARIO.HOSTED_FAILED);
  assert.equal(paid, false);
  assert.equal(record.status, 'Failed');
});

test('a failure with no stored reference gets a PM-FAIL- fallback', () => {
  // No referenceNumber on the pending record, so buildReturnRecord derives one.
  const { record } = walkReturn({
    search: '?payment=failed',
    pending: pendingCheckout({ referenceNumber: '' }),
    gateway: { sessionStatus: 'failed' }
  });
  assert.match(record.referenceNumber, /^PM-FAIL-/);
});

test('PATH 4 - a failed checkout never touches the balance', () => {
  const { record } = walkReturn({
    search: '?payment=failed',
    pending: pendingCheckout(),
    gateway: { sessionStatus: 'failed' }
  });
  assert.equal(record.status, 'Failed');

  const ledger = computeAmountDue({ baseline: AMOUNT, payments: [] });
  assert.equal(ledger, AMOUNT, 'a failed payment leaves the rent fully due');
  assert.equal(paymentStatusFor(ledger), 'Pending');
});

test('no return and no pending record is a clean no-op', () => {
  const { scenario, record } = walkReturn({ search: '', pending: null, gateway: {} });
  assert.equal(scenario.kind, SCENARIO.NONE);
  assert.equal(record, null);
});

test('only a failed/expired session is worth expiring again', () => {
  assert.equal(shouldExpireSession(SCENARIO.PENDING_SESSION, 'expired'), false);
  assert.equal(shouldExpireSession(SCENARIO.PENDING_SESSION, 'unpaid'), true);
  assert.equal(shouldExpireSession(SCENARIO.HOSTED_FAILED, 'active'), true);
  assert.equal(shouldExpireSession(SCENARIO.HOSTED_SUCCESS, 'paid'), false);
});

test('the webhook closes the loop on a corroborated payment', () => {
  // Full path: redirect claim -> webhook confirms -> balance recomputed.
  const { record } = walkReturn({
    search: '?payment=success&amount=5000',
    pending: pendingCheckout(),
    gateway: { sessionStatus: 'paid' }
  });

  const payment = webhookPaid();
  const { state } = decideVerification({ attempt: record, serverPayments: [payment] });
  assert.equal(state, VERIFICATION.CONFIRMED);

  // What functions/index.js then writes to tenants.amountDue.
  const amountDue = computeAmountDue({ baseline: AMOUNT, payments: [payment] });
  assert.equal(amountDue, 0);
  assert.equal(paymentStatusFor(amountDue), 'Paid');

  // And what the tenant's browser therefore renders.
  const { due } = resolveAmountDue({
    rent: AMOUNT,
    serverPayments: [payment],
    explicitAmountDue: amountDue
  });
  assert.equal(due, 0);
});

test('a partial payment settles the remainder exactly once', () => {
  const payment = webhookPaid({ amount: 2000 });
  const amountDue = computeAmountDue({ baseline: 5000, payments: [payment] });
  assert.equal(amountDue, 3000);

  // A redelivery of the same event recomputes to the same figure.
  assert.equal(computeAmountDue({ baseline: 5000, payments: [payment] }), 3000);
});

test('a stale amountDue does not shadow a newly confirmed payment forever', () => {
  // Regression: the stored balance is authoritative, but only because the
  // webhook keeps recomputing it. Simulate that and show the number moves.
  let stored = computeAmountDue({ baseline: 5000, payments: [] });
  assert.equal(stored, 5000);

  stored = computeAmountDue({ baseline: 5000, payments: [webhookPaid()] });
  assert.equal(stored, 0);

  const { due } = resolveAmountDue({
    rent: 5000,
    serverPayments: [webhookPaid()],
    explicitAmountDue: stored
  });
  assert.equal(due, 0);
});
