/**
 * Rent ledger arithmetic.
 *
 * `tenants.amountDue` is the authoritative balance. It is written by exactly
 * two callers: staff (create/edit tenant), and the PayMongo webhook
 * (functions/index.js) once it confirms a payment. The browser never writes it.
 *
 * CommonJS on purpose: the Cloud Function (`functions/index.js`) is CommonJS
 * and must `require()` this, while the ESM test suite imports it. A single
 * source avoids the two implementations drifting apart.
 */

/**
 * Sums the peso value of payments that represent money actually received.
 *
 * Only 'Paid' counts. 'Failed' money never moved; 'Pending' has not settled.
 *
 * @param {Array<Object>} payments
 * @returns {number}
 */
function settledTotal(payments) {
  if (!Array.isArray(payments)) return 0;
  return payments.reduce((sum, payment) => {
    if (!payment) return sum;
    const status = String(payment.status ?? '')
      .trim()
      .toLowerCase();
    if (status !== 'paid') return sum;
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) return sum;
    return sum + amount;
  }, 0);
}

/**
 * Computes the new balance after the ledger changes.
 *
 * Recomputed from the payment ledger rather than decremented blindly, so the
 * result cannot drift and cannot go negative:
 *   - duplicate webhook deliveries are idempotent, because each payment
 *     document is counted once;
 *   - a void/refund settles as 'Failed' and is excluded from the total;
 *   - a refund larger than the rent floors at 0, never a negative balance.
 *
 * @param {Object} params
 * @param {number|null} params.baseline - rent for the current cycle
 * @param {Array<Object>} params.payments - every payment for this cycle
 * @returns {number} the new amountDue, >= 0
 */
function computeAmountDue({ baseline, payments } = {}) {
  const rent = Number(baseline);
  if (!Number.isFinite(rent) || rent <= 0) {
    // No usable baseline: fall back to 0 rather than inventing a figure.
    return 0;
  }
  return Math.max(0, rent - settledTotal(payments));
}

/**
 * The tenant-facing payment status derived from a balance.
 *
 * @param {number} amountDue
 * @returns {'Paid'|'Pending'}
 */
function paymentStatusFor(amountDue) {
  return Number(amountDue) > 0 ? 'Pending' : 'Paid';
}

module.exports = { settledTotal, computeAmountDue, paymentStatusFor };
