/**
 * Room-booking decisions.
 *
 * Availability can only ever be driven down by a *successful* approval, and
 * only when a slot actually remains. These pure helpers encode that rule so
 * `node --test` can prove the branches the transaction relies on.
 *
 * The caller is `render/reservations.js`, which wraps them in a Firestore
 * transaction so the read-then-write is atomic.
 */

/** A reservation a visitor submitted and nobody has decided on yet. */
export const PENDING = 'Pending';

/**
 * Statuses that mean "this request is finished -- stop touching it".
 *
 * 'Converted' is set once the tenant account has been created from an approved
 * request, which is what stops one approval spawning two tenants.
 */
export const DECIDED_STATUSES = ['Approved', 'Declined', 'Converted'];

/**
 * Normalises an admin-supplied availability count.
 *
 * The dashboard stepper and the `set-room.js` CLI both funnel through this, so
 * the two can never disagree about what a valid count is. A room can never hold
 * a negative or fractional number of slots.
 *
 * @param {unknown} value
 * @param {number} [max] - optional ceiling (e.g. total capacity)
 * @returns {number} a non-negative integer
 */
export function clampAvailability(value, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;

  const whole = Math.max(0, Math.floor(parsed));

  // `Number(null)` is 0, so a null/undefined ceiling ("this room has no
  // recorded capacity") would otherwise clamp every count to zero. Treat a
  // missing or nonsensical ceiling as "no ceiling".
  const hasCeiling =
    max !== null && max !== undefined && max !== '' && Number.isFinite(Number(max));
  if (!hasCeiling) return whole;

  return Math.min(whole, Math.max(0, Math.floor(Number(max))));
}

/**
 * Whether a request still needs a decision.
 * @param {string} status
 */
export function isOpen(status) {
  return !DECIDED_STATUSES.includes(String(status ?? '').trim());
}

/**
 * Whether a reservation request may be approved right now.
 *
 * Refuses closed on both known bad states:
 *   - the request was already approved or declined (prevents the double-approve
 *     race that used to decrement availability twice);
 *   - the room has no slots left (prevents approving into a full room).
 *
 * @param {Object} params
 * @param {string} params.reservationStatus - current status on the request
 * @param {number} params.available - current free slots for that room
 * @returns {{ok: boolean, reason?: string}}
 */
export function canApprove({ reservationStatus, available } = {}) {
  const status = String(reservationStatus ?? '').trim();

  if (DECIDED_STATUSES.includes(status)) {
    return { ok: false, reason: 'already-decided' };
  }

  const slots = Number(available);
  if (!Number.isFinite(slots) || slots <= 0) {
    return { ok: false, reason: 'no-availability' };
  }

  return { ok: true };
}

/**
 * The free slots remaining after approving one request.
 *
 * Floors at 0 so a bad incoming count can never make a room negative.
 *
 * @param {number} available
 * @returns {number}
 */
export function nextAvailability(available) {
  const slots = Number(available);
  if (!Number.isFinite(slots)) return 0;
  return Math.max(0, slots - 1);
}

/**
 * Whether a request may be declined.
 *
 * Approving is capacity-checked; declining just must not re-decide a request
 * that already has an outcome.
 *
 * @param {string} reservationStatus
 * @returns {{ok: boolean, reason?: string}}
 */
export function canDecline(reservationStatus) {
  const status = String(reservationStatus ?? '').trim();
  if (DECIDED_STATUSES.includes(status)) {
    return { ok: false, reason: 'already-decided' };
  }
  return { ok: true };
}
