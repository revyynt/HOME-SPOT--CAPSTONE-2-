import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PENDING,
  DECIDED_STATUSES,
  isOpen,
  canApprove,
  canDecline,
  nextAvailability
} from '../assets/js/lib/booking.js';

test('a pending request with a free slot can be approved', () => {
  assert.deepEqual(canApprove({ reservationStatus: PENDING, available: 3 }), { ok: true });
  assert.deepEqual(canApprove({ reservationStatus: PENDING, available: 1 }), { ok: true });
});

test('approving an already-approved request is refused', () => {
  // The double-approve race: a second transaction re-reads the request and must
  // refuse rather than decrementing availability again.
  assert.deepEqual(canApprove({ reservationStatus: 'Approved', available: 3 }), {
    ok: false,
    reason: 'already-decided'
  });
});

test('approving a declined request is refused', () => {
  assert.deepEqual(canApprove({ reservationStatus: 'Declined', available: 3 }), {
    ok: false,
    reason: 'already-decided'
  });
});

test('approving into a full room is refused', () => {
  assert.deepEqual(canApprove({ reservationStatus: PENDING, available: 0 }), {
    ok: false,
    reason: 'no-availability'
  });
  assert.deepEqual(canApprove({ reservationStatus: PENDING, available: -2 }), {
    ok: false,
    reason: 'no-availability'
  });
});

test('unknown or missing availability is treated as no availability', () => {
  // Fail closed: if we cannot prove a slot exists, do not approve.
  assert.deepEqual(canApprove({ reservationStatus: PENDING, available: undefined }), {
    ok: false,
    reason: 'no-availability'
  });
  assert.deepEqual(canApprove({ reservationStatus: PENDING, available: 'lots' }), {
    ok: false,
    reason: 'no-availability'
  });
});

test('a missing status is not treated as already-decided', () => {
  // A request with no status field yet is still actionable.
  assert.deepEqual(canApprove({ reservationStatus: undefined, available: 1 }), { ok: true });
});

test('canApprove tolerates a missing argument object', () => {
  assert.deepEqual(canApprove(), { ok: false, reason: 'no-availability' });
});

test('the last slot can be taken exactly once', () => {
  assert.equal(canApprove({ reservationStatus: PENDING, available: 1 }).ok, true);
  // After that approval, availability is 0 and further approvals are refused.
  const after = nextAvailability(1);
  assert.equal(after, 0);
  assert.deepEqual(canApprove({ reservationStatus: PENDING, available: after }), {
    ok: false,
    reason: 'no-availability'
  });
});

test('nextAvailability decrements by one', () => {
  assert.equal(nextAvailability(3), 2);
  assert.equal(nextAvailability(2), 1);
});

test('nextAvailability never goes negative', () => {
  assert.equal(nextAvailability(0), 0);
  assert.equal(nextAvailability(-5), 0);
  assert.equal(nextAvailability(NaN), 0);
  assert.equal(nextAvailability(undefined), 0);
});

test('a pending request may always be declined', () => {
  assert.deepEqual(canDecline(PENDING), { ok: true });
  assert.deepEqual(canDecline(undefined), { ok: true });
});

test('a decided request may not be declined again', () => {
  // Guards against a decline overwriting an approval.
  assert.deepEqual(canDecline('Approved'), { ok: false, reason: 'already-decided' });
  assert.deepEqual(canDecline('Declined'), { ok: false, reason: 'already-decided' });
});

test('DECIDED_STATUSES covers exactly the terminal states', () => {
  assert.deepEqual(DECIDED_STATUSES, ['Approved', 'Declined', 'Converted']);
  assert.ok(!DECIDED_STATUSES.includes(PENDING));
});

test('a converted request is terminal for both approve and decline', () => {
  // Once the tenant account exists the request is finished. Re-touching it
  // would let a repeat click spawn a second tenant.
  assert.deepEqual(canApprove({ reservationStatus: 'Converted', available: 3 }), {
    ok: false,
    reason: 'already-decided'
  });
  assert.deepEqual(canDecline('Converted'), { ok: false, reason: 'already-decided' });
});

test('isOpen is true only for an undecided request', () => {
  assert.equal(isOpen(PENDING), true);
  assert.equal(isOpen(undefined), true);
  assert.equal(isOpen('Approved'), false);
  assert.equal(isOpen('Declined'), false);
  assert.equal(isOpen('Converted'), false);
});
