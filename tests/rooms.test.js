import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRoomDocId, resolveRoom, ROOM_ALIASES } from '../assets/js/lib/rooms.js';

test('normalizeRoomDocId matches the Firestore document ids in use', () => {
  assert.equal(normalizeRoomDocId('Triple Occupancy Room'), 'triple-occupancy-room');
  assert.equal(normalizeRoomDocId('Commercial Space'), 'commercial-space');
});

test('normalizeRoomDocId is case- and whitespace-insensitive', () => {
  assert.equal(normalizeRoomDocId('  TRIPLE   occupancy   ROOM '), 'triple-occupancy-room');
  assert.equal(normalizeRoomDocId('Triple\nOccupancy\tRoom'), 'triple-occupancy-room');
});

test('normalizeRoomDocId strips characters Firestore paths cannot contain', () => {
  assert.equal(normalizeRoomDocId('Room #3 (A/B)'), 'room-3-ab');
  assert.equal(normalizeRoomDocId('a.b.c'), 'abc');
});

test('normalizeRoomDocId never returns an empty string for empty input', () => {
  assert.equal(normalizeRoomDocId(''), '');
  assert.equal(normalizeRoomDocId(null), '');
  assert.equal(normalizeRoomDocId(undefined), '');
});

test('resolveRoom maps known aliases to canonical rooms', () => {
  assert.deepEqual(resolveRoom('triple'), {
    id: 'triple-occupancy-room',
    name: 'Triple Occupancy Room'
  });
  assert.deepEqual(resolveRoom('commercial space'), {
    id: 'commercial-space',
    name: 'Commercial Space'
  });
});

test('resolveRoom falls back to slugifying unknown rooms', () => {
  assert.deepEqual(resolveRoom('Dorm B'), { id: 'dorm-b', name: 'Dorm B' });
});

test('every ROOM_ALIASES entry is internally consistent', () => {
  for (const [key, room] of Object.entries(ROOM_ALIASES)) {
    assert.equal(room.id, normalizeRoomDocId(room.name), `alias "${key}" id mismatch`);
  }
});
