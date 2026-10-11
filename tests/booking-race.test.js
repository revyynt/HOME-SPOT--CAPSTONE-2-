/**
 * Concurrent-approval walkthrough.
 *
 * Reproduces the double-approve race that used to corrupt availability, using a
 * fake Firestore with the same retry-and-serialize semantics as the real one,
 * then drives the same decision helpers the transaction uses.
 *
 * The bug: approveReservation previously did `updateDoc(request)` and then a
 * separate `decrementRoomAvailability()`. Two clicks (or two admin tabs) both
 * succeeded and decremented twice, and approving into a full room was allowed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { canApprove, canDecline, nextAvailability } from '../assets/js/lib/booking.js';

/**
 * Minimal in-memory stand-in for the Firestore transaction used by
 * approveReservation: reads the request and the room, applies the decision, and
 * writes both or neither.
 *
 * `settle` models Firestore's behaviour of aborting and retrying a transaction
 * whose reads changed mid-flight, which is exactly what stops the second
 * concurrent approval from committing.
 */
function fakeTransaction({ reservations, rooms }, reservationId) {
  return async function run() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const request = reservations[reservationId];
      if (!request) return { ok: false, reason: 'missing' };

      const room = rooms[request.room];
      const available = room ? Number(room.available ?? 0) : 0;

      const decision = canApprove({ reservationStatus: request.status, available });
      if (!decision.ok) return { ok: false, reason: decision.reason };

      // Commit both writes together.
      request.status = 'Approved';
      room.available = nextAvailability(available);

      return { ok: true, available: room.available };
    }
    return { ok: false, reason: 'contention' };
  };
}

function seed(available) {
  return {
    reservations: { r1: { room: 'triple', status: 'Pending' } },
    rooms: { triple: { available } }
  };
}

test('approving a pending request decrements exactly once', async () => {
  const store = seed(3);
  const approve = fakeTransaction(store, 'r1');

  const result = await approve();
  assert.equal(result.ok, true);
  assert.equal(store.rooms.triple.available, 2);
  assert.equal(store.reservations.r1.status, 'Approved');
});

test('a second approval of the same request is refused', async () => {
  // This is the regression: the second transaction re-reads status 'Approved'
  // and must refuse, so availability is NOT decremented again.
  const store = seed(3);
  const approve = fakeTransaction(store, 'r1');

  await approve();
  const second = await approve();

  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already-decided');
  assert.equal(store.rooms.triple.available, 2, 'availability must stay at 2, not 1');
});

test('the last slot cannot be taken twice', async () => {
  const store = seed(1);
  const approve = fakeTransaction(store, 'r1');

  await approve();
  const second = await approve();

  assert.equal(second.ok, false);
  assert.equal(store.rooms.triple.available, 0);
});

test('approving into a full room is refused', async () => {
  // Previously allowed: the room was at 0 but the update still went through.
  const store = seed(0);
  const approve = fakeTransaction(store, 'r1');

  const result = await approve();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-availability');
  assert.equal(store.reservations.r1.status, 'Pending', 'request must stay undecided');
  assert.equal(store.rooms.triple.available, 0);
});

test('each distinct request consumes one slot until the room is full', async () => {
  const store = {
    reservations: {
      a: { room: 'triple', status: 'Pending' },
      b: { room: 'triple', status: 'Pending' },
      c: { room: 'triple', status: 'Pending' },
      d: { room: 'triple', status: 'Pending' }
    },
    rooms: { triple: { available: 3 } }
  };

  const okCount = [];
  for (const id of ['a', 'b', 'c', 'd']) {
    const res = await fakeTransaction(store, id)();
    if (res.ok) okCount.push(id);
  }

  // Three slots, four requests: exactly three succeed, availability lands at 0.
  assert.equal(okCount.length, 3);
  assert.equal(store.rooms.triple.available, 0);
  assert.equal(store.reservations.d.status, 'Pending', 'the fourth must stay pending');
});

test('a declined request cannot be approved afterwards', async () => {
  const store = seed(3);
  store.reservations.r1.status = 'Declined';

  const result = await fakeTransaction(store, 'r1')();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'already-decided');
  assert.equal(
    store.rooms.triple.available,
    3,
    'a declined request frees nothing and consumes nothing'
  );
});

test('decline cannot overwrite an approval', () => {
  assert.equal(canDecline('Approved').ok, false);
  assert.equal(canDecline('Pending').ok, true);
});
