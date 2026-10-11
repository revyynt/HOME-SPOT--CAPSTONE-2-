/**
 * Payment verification.
 *
 * A PayMongo redirect only proves the payer left the site -- anyone can type
 * `?payment=success` into the URL bar. So the redirect is treated as a *claim*
 * that has to be corroborated, never as proof.
 *
 * The authoritative record is the `payments` document written by the Cloud
 * Function webhook (functions/index.js), which firestore.rules already exposes
 * read-only to the payer:
 *
 *   match /payments/{paymentId} {
 *     allow read: if isAdmin() || (isSignedIn() && resource.data.tenantEmail == myEmail());
 *     allow write: if false;
 *   }
 *
 * Until the webhook lands, an attempt stays PENDING. Pure logic, so every
 * branch is unit-testable and the portal only has to perform the I/O.
 */

export const VERIFICATION = {
  /** The webhook confirmed a matching paid payment. */
  CONFIRMED: 'Confirmed',
  /** The webhook has not reported an outcome yet. */
  PENDING: 'Pending',
  /** The webhook reported a terminal failure for this attempt. */
  FAILED: 'Failed',
  /** Nothing to verify (no pending attempt). */
  NONE: 'None'
};

const DEFAULT_WINDOW_HOURS = 24;

/** Milliseconds a webhook event may lag the checkout before we stop matching. */
export function windowMs(hours = DEFAULT_WINDOW_HOURS) {
  return Math.max(0, Number(hours) || 0) * 60 * 60 * 1000;
}

/**
 * Parses a Firestore Timestamp, an ISO string, epoch millis, or nothing.
 * @returns {number|null} epoch millis, or null when unparseable
 */
export function toMillis(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  // Firestore Timestamp: { seconds, nanoseconds }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return value.seconds * 1000;
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const ms = value.toDate().getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function sameEmail(a, b) {
  const left = String(a ?? '')
    .trim()
    .toLowerCase();
  const right = String(b ?? '')
    .trim()
    .toLowerCase();
  return left !== '' && left === right;
}

function amountMatches(record, expected) {
  const left = Number(record?.amount);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  // PayMongo amounts are exact centavos; a cent of drift means it is not this
  // payment, so compare with a half-cent tolerance rather than loosely.
  return Math.abs(left - right) < 0.005;
}

/**
 * Whether a server payment record can plausibly settle `attempt`.
 *
 * Matches on payer + amount, and requires the record to fall inside the
 * window around the moment the checkout started. The window is what stops an
 * old, unrelated payment from "confirming" a fresh attempt.
 *
 * @param {Object} attempt - the local pending record (tenantEmail, amount, startedAtMs)
 * @param {Object} record - a document from the `payments` collection
 * @param {{windowHours?: number}} [options]
 */
export function isMatchFor(attempt, record, options = {}) {
  if (!attempt || !record) return false;
  if (!sameEmail(attempt.tenantEmail, record.tenantEmail)) return false;
  if (!amountMatches(record, attempt.amount)) return false;

  const span = windowMs(options.windowHours);
  const startedAt = toMillis(attempt.startedAtMs);
  if (startedAt === null) return false;

  const settledAt = toMillis(record.timestamp ?? record.createdAt);
  if (settledAt === null) return false;

  const delta = settledAt - startedAt;
  return delta >= -span && delta <= span;
}

/**
 * Decides the verified state of a pending attempt from the server's payments.
 *
 * A Failed outcome only wins when there is no Confirmed one: PayMongo can emit
 * `payment.failed` for an early attempt on a session that later succeeds, and
 * the payer should not be shown a failure for money that was taken.
 *
 * @param {Object} params
 * @param {Object|null} params.attempt
 * @param {Array<Object>} params.serverPayments
 * @param {number} params.windowHours
 * @returns {{state: string, match: Object|null}}
 */
export function decideVerification({ attempt, serverPayments = [], windowHours } = {}) {
  if (!attempt) return { state: VERIFICATION.NONE, match: null };

  const candidates = Array.isArray(serverPayments) ? serverPayments : [];
  let failure = null;

  for (const record of candidates) {
    if (!isMatchFor(attempt, record, { windowHours })) continue;

    const status = String(record.status ?? '')
      .trim()
      .toLowerCase();
    if (status === 'paid') return { state: VERIFICATION.CONFIRMED, match: record };
    if (status === 'failed' && !failure) failure = record;
  }

  if (failure) return { state: VERIFICATION.FAILED, match: failure };
  return { state: VERIFICATION.PENDING, match: null };
}

/**
 * Sum of the peso amounts the webhook has confirmed as paid.
 *
 * This is the number the balance must be derived from -- never the sum of the
 * browser's own local records, which a user can edit.
 *
 * @param {Array<Object>} serverPayments
 * @returns {number}
 */
export function confirmedTotal(serverPayments = []) {
  if (!Array.isArray(serverPayments)) return 0;
  return serverPayments
    .filter(
      (record) =>
        record &&
        String(record.status ?? '')
          .trim()
          .toLowerCase() === 'paid'
    )
    .reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
}

/**
 * The amount a tenant still owes.
 *
 * Authority order:
 *
 *   1. `amountDue` -- the stored balance. Written only by staff and by the
 *      webhook's `reconcileTenantBalance` (functions/index.js), which recomputes
 *      it from the payment ledger after every event. It carries staff intent
 *      (discounts, waivers), so it wins when present.
 *   2. rent minus confirmed payments -- used only when no balance has been
 *      stored yet, e.g. a tenant created before the webhook ever ran.
 *   3. rent -- the fallback when there are no payments and no balance.
 *
 * The browser never writes any of these; firestore.rules denies it. That is what
 * makes the displayed balance trustworthy.
 *
 * @param {Object} params
 * @param {number} params.rent
 * @param {Array<Object>} params.serverPayments
 * @param {number|null} [params.explicitAmountDue]
 * @returns {{due: number, source: 'explicit'|'confirmed-total'|'rent'}}
 */
export function resolveAmountDue({ rent, serverPayments = [], explicitAmountDue = null } = {}) {
  const baseRent = Number(rent);

  // `Number(null)` is 0, so an unset balance would otherwise be read as an
  // explicit "settled" figure. Distinguish "not provided" from a real 0.
  const hasExplicit =
    explicitAmountDue !== null &&
    explicitAmountDue !== undefined &&
    explicitAmountDue !== '' &&
    Number.isFinite(Number(explicitAmountDue));

  if (hasExplicit) {
    return { due: Math.max(0, Number(explicitAmountDue)), source: 'explicit' };
  }

  const total = confirmedTotal(serverPayments);
  if (total > 0 && Number.isFinite(baseRent)) {
    return { due: Math.max(0, baseRent - total), source: 'confirmed-total' };
  }

  return { due: Number.isFinite(baseRent) ? Math.max(0, baseRent) : 0, source: 'rent' };
}
