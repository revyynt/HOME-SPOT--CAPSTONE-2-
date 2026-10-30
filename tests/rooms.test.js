import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeRoomDocId,
  resolveRoom,
  ROOM_ALIASES,
  formatRoomPrice,
  mergeRoomData
} from '../assets/js/lib/rooms.js';

test('normalizeRoomDocId matches the existing room document ids', () => {
  assert.equal(normalizeRoomDocId('Triple Occupancy Room'), 'triple-occupancy-room');
  assert.equal(normalizeRoomDocId('Commercial Space'), 'commercial-space');
});

test('normalizeRoomDocId is case- and whitespace-insensitive', () => {
  assert.equal(normalizeRoomDocId('  TRIPLE   occupancy   ROOM '), 'triple-occupancy-room');
  assert.equal(normalizeRoomDocId('Triple\nOccupancy\tRoom'), 'triple-occupancy-room');
});

test('normalizeRoomDocId strips invalid document id characters', () => {
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
  assert.deepEqual(resolveRoom('Unit B'), { id: 'unit-b', name: 'Unit B' });
});

test('every ROOM_ALIASES entry is internally consistent', () => {
  for (const [key, room] of Object.entries(ROOM_ALIASES)) {
    assert.equal(room.id, normalizeRoomDocId(room.name), `alias "${key}" id mismatch`);
  }
});

test('mergeRoomData and formatRoomPrice merge remote Supabase fields over defaults', () => {
  const merged = mergeRoomData('triple-occupancy-room', {
    price: '11500',
    features: '3 People, WiFi, Aircon',
    image: 'https://example.com/room.jpg'
  });
  assert.equal(merged.price, 11500);
  assert.equal(formatRoomPrice(merged.price), '₱11,500');
  assert.equal(formatRoomPrice(merged.price, true), '₱11,500/month');
  assert.deepEqual(merged.features, ['3 People', 'WiFi', 'Aircon']);
  assert.equal(merged.image, 'https://example.com/room.jpg');
});
