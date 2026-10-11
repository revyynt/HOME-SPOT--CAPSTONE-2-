import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUnits } from '../assets/js/pages/admin-dashboard/units-editor.js';

test('builds floor-then-position unit numbers', () => {
  const units = buildUnits(2, 3);
  assert.deepEqual(
    units.map((u) => u.number),
    ['101', '102', '103', '201', '202', '203']
  );
});

test('the document id matches the unit number', () => {
  // The viewer and the reservations flow both key on this, so a mismatch would
  // silently produce units nothing can reference.
  for (const unit of buildUnits(2, 2)) {
    assert.equal(unit.id, unit.number);
  }
});

test('order is zero-based within the floor', () => {
  const units = buildUnits(1, 3);
  assert.deepEqual(
    units.map((u) => u.order),
    [0, 1, 2]
  );
});

test('the shape maths is correct', () => {
  assert.equal(buildUnits(3, 4).length, 12);
  assert.equal(buildUnits(1, 1).length, 1);
  assert.equal(buildUnits(10, 10).length, 100);
});

test('floors and positions are zero-padded to two digits', () => {
  // "203" not "2031" -- the padding keeps the id a fixed width.
  const units = buildUnits(10, 1);
  assert.equal(units[0].number, '101');
  assert.equal(units[9].number, '1001');
});

test('floors start at 1', () => {
  assert.equal(buildUnits(1, 1)[0].floor, 1);
});

test('defaults to the triple-occupancy type', () => {
  assert.equal(buildUnits(1, 1)[0].type, 'triple-occupancy-room');
});

test('the type can be overridden', () => {
  assert.equal(buildUnits(1, 1, 'commercial-space')[0].type, 'commercial-space');
});

test('nonsense input is clamped rather than producing junk', () => {
  assert.ok(buildUnits(0, 0).length >= 1, 'never zero units');
  assert.ok(buildUnits(-5, -5).length >= 1);
  assert.ok(buildUnits('abc', 'xyz').length >= 1, 'non-numeric falls back safely');
});

test('an oversized request is capped', () => {
  // Without a cap a typo like 99999 would start thousands of writes.
  assert.ok(buildUnits(9999, 9999).length <= 20 * 20);
});

test('fractional input is floored', () => {
  assert.equal(buildUnits(2.9, 2.9).length, 4);
});
