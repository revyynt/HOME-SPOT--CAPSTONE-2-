/**
 * Payment-return state machine.
 *
 * PayMongo returns a tenant to the portal through four different shapes, and
 * the redirect handling is easy to get subtly wrong. This module contains the
 * *decision* logic only -- no DOM, no network, no storage -- so every branch can
 * be unit tested.
 *
 * The caller performs the I/O the decision asks for, then feeds the result back
 * via buildReturnRecord().
 */

export const SCENARIO = {
  NONE: 'none',
  PENDING_SESSION: 'pending-session',
  CARD_3DS: 'card-3ds',
  HOSTED_SUCCESS: 'hosted-success',
  HOSTED_FAILED: 'hosted-failed'
};

const DEFAULT_AMOUNT = 5000;
const DEFAULT_PURPOSE = 'Monthly Rent';
const DEFAULT_TENANT = 'Tenant';
const DEFAULT_FAILURE = 'Card declined or 3DS authentication failed.';

/**
 * Reads a parameter from the query string, falling back to a raw-href regex.
 *
 * PayMongo has been observed to append parameters in forms that
 * URLSearchParams alone does not always pick up on some browsers.
 */
function readParam(params, name, href) {
  const fromParams = params.get(name);
  if (fromParams) return fromParams;
  if (!href) return null;
  const match = href.match(new RegExp(`[?&]${name}=([^&#]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Decides how to handle a return to the tenant portal.
 *
 * @param {Object} input
 * @param {string} input.search - window.location.search
 * @param {string} [input.href] - window.location.href (fallback for params)
 * @param {Object|null} [input.pending] - the pending payment record read from storage
 * @param {string} [input.fallbackTenantName] - profile name, used when pending has none
 * @param {number} [input.now] - injectable clock for reference suffixes
 * @returns {{kind: string, [key: string]: any}}
 */
export function resolveReturnScenario({
  search = '',
  href = '',
  pending = null,
  fallbackTenantName = DEFAULT_TENANT,
  now = Date.now()
} = {}) {
  const params = new URLSearchParams(search);

  let paymentIntentId = readParam(params, 'payment_intent_id', href);
  const paymentStatus = readParam(params, 'payment', href);

  // PayMongo sometimes returns without any query params at all when a card is
  // declined mid-3DS. The pending record is the only surviving signal.
  if (!paymentIntentId && !paymentStatus && pending?.paymentIntentId) {
    paymentIntentId = pending.paymentIntentId;
  }

  const amountFromUrl = parseFloat(params.get('amount'));

  // --- Scenario: pending checkout session, no params at all ------------------
  if (!paymentIntentId && !paymentStatus && pending?.sessionId) {
    return {
      kind: SCENARIO.PENDING_SESSION,
      sessionId: pending.sessionId,
      clearPending: true,
      stripUrl: true,
      targetTab: 'payment',
      base: buildBase({
        // Note: this branch deliberately does NOT prefer the URL amount.
        amount: parseFloat(pending.amount) || DEFAULT_AMOUNT,
        purpose: pending.purpose || DEFAULT_PURPOSE,
        tenantName: pending.tenantName || fallbackTenantName,
        referenceNumber: pending.referenceNumber || suffix('PM-RET-', now),
        method: pending.method || 'PayMongo Checkout',
        notes: pending.notes
      })
    };
  }

  // --- Nothing to do ---------------------------------------------------------
  if (!paymentIntentId && !paymentStatus) {
    return { kind: SCENARIO.NONE, clearPending: false, stripUrl: false, targetTab: null };
  }

  const shared = {
    clearPending: true,
    stripUrl: true,
    targetTab: 'payment',
    base: buildBase({
      amount: amountFromUrl || pending?.amount || DEFAULT_AMOUNT,
      purpose: params.get('purpose') || pending?.purpose || DEFAULT_PURPOSE,
      tenantName: pending?.tenantName || fallbackTenantName,
      referenceNumber: pending?.referenceNumber,
      method: params.get('method') || pending?.method,
      notes: pending?.notes
    })
  };

  // --- Scenario: direct card 3DS --------------------------------------------
  if (paymentIntentId) {
    return {
      ...shared,
      kind: SCENARIO.CARD_3DS,
      paymentIntentId,
      base: {
        ...shared.base,
        referenceNumber:
          pending?.referenceNumber || `PM-CARD-${paymentIntentId.slice(-6).toUpperCase()}`,
        method: 'Credit/Debit Card (PayMongo Test 3DS)'
      }
    };
  }

  // --- Scenario: hosted checkout succeeded ------------------------------------
  if (paymentStatus === 'success') {
    return {
      ...shared,
      kind: SCENARIO.HOSTED_SUCCESS,
      sessionId: pending?.sessionId || '',
      base: {
        ...shared.base,
        referenceNumber: shared.base.referenceNumber || suffix('PM-RET-', now),
        method: params.get('method') || pending?.method || 'PayMongo Checkout'
      }
    };
  }

  // --- Scenario: hosted checkout failed or cancelled ---------------------------
  if (paymentStatus === 'failed' || paymentStatus === 'cancelled') {
    return {
      ...shared,
      kind: SCENARIO.HOSTED_FAILED,
      sessionId: pending?.sessionId || params.get('sessionId') || '',
      base: {
        ...shared.base,
        referenceNumber: shared.base.referenceNumber || suffix('PM-FAIL-', now),
        method: pending?.method || 'Credit/Debit Card (PayMongo Checkout)'
      }
    };
  }

  return { kind: SCENARIO.NONE, clearPending: false, stripUrl: false, targetTab: null };
}

function buildBase({ amount, purpose, tenantName, referenceNumber, method, notes }) {
  return {
    amount,
    purpose,
    tenantName,
    referenceNumber: referenceNumber || null,
    method: method || null,
    notes: notes || null
  };
}

function suffix(prefix, now) {
  return prefix + String(now).slice(-6);
}

/**
 * Interprets a PayMongo PaymentIntent payload.
 * @param {Object|null} piData
 * @returns {{isSuccess: boolean, status: string, failureDetail: string}}
 */
export function interpretPaymentIntent(piData) {
  const attributes = piData?.attributes;
  if (!attributes) {
    return {
      isSuccess: false,
      status: 'awaiting_payment_method',
      failureDetail: '3DS Authentication Failed / Card Declined in PayMongo test mode'
    };
  }

  const status = attributes.status;
  if (status === 'succeeded') {
    return { isSuccess: true, status, failureDetail: null };
  }

  const lastError = attributes.last_payment_error;
  const detail = lastError?.failed_message || lastError?.detail;
  return {
    isSuccess: false,
    status,
    failureDetail: detail || '3DS Authentication Failed / Card Declined in PayMongo test mode'
  };
}

/**
 * Interprets a PayMongo Checkout Session payload.
 *
 * `failureDetail` is null for a paid session -- callers must never be handed a
 * "card declined" message alongside a successful payment.
 *
 * @param {Object|null} sessionData
 * @returns {{status: string|null, failureDetail: string|null}}
 */
export function interpretCheckoutSession(sessionData) {
  const attributes = sessionData?.attributes;
  if (!attributes) {
    return { status: null, failureDetail: DEFAULT_FAILURE };
  }

  const status = attributes.status ?? null;
  if (status === 'paid') {
    return { status, failureDetail: null };
  }

  const lastError = attributes.payment_intent?.attributes?.last_payment_error;
  const detail = lastError?.failed_message || lastError?.detail;
  return {
    status,
    failureDetail: detail || DEFAULT_FAILURE
  };
}

/**
 * Builds the persisted payment record for a resolved scenario.
 *
 * @param {Object} scenario - a value returned by resolveReturnScenario()
 * @param {Object} outcome
 * @param {'Paid'|'Failed'} outcome.status
 * @param {string} [outcome.paymentMethodId]
 * @param {string} [outcome.failureReason]
 * @param {string} [outcome.tenantEmail]
 * @param {string} [outcome.defaultNotes]
 * @param {number} [outcome.now]
 * @returns {Object} the record handed to saveAndFinalizePayment / saveFailedPayment
 */
export function buildReturnRecord(scenario, outcome) {
  const now = outcome.now ?? Date.now();
  const succeeded = outcome.status === 'Paid';
  const base = scenario.base;

  const defaultNotes =
    outcome.defaultNotes ??
    (succeeded ? 'Completed via PayMongo Checkout' : 'Payment was not completed');

  return {
    referenceNumber: base.referenceNumber || suffix(succeeded ? 'PM-RET-' : 'PM-FAIL-', now),
    paymentMethodId:
      outcome.paymentMethodId || scenario.paymentIntentId || scenario.sessionId || null,
    method: base.method || 'PayMongo Checkout',
    amount: base.amount,
    purpose: base.purpose,
    notes: base.notes || defaultNotes,
    ...(succeeded ? {} : { failureReason: outcome.failureReason || DEFAULT_FAILURE }),
    tenantName: base.tenantName,
    tenantEmail: outcome.tenantEmail || '',
    dateFormatted: new Date(now).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }),
    status: outcome.status
  };
}

/**
 * Whether the PayMongo checkout session should be expired after the outcome is
 * recorded. A session that is already `expired` needs no further call.
 *
 * @param {string} scenarioKind
 * @param {string|null} sessionStatus
 * @returns {boolean}
 */
export function shouldExpireSession(scenarioKind, sessionStatus) {
  if (scenarioKind !== SCENARIO.PENDING_SESSION && scenarioKind !== SCENARIO.HOSTED_FAILED) {
    return false;
  }
  return sessionStatus !== 'expired';
}
