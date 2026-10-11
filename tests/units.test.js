import test from 'node:test';
import assert from 'node:assert/strict';

import {
  UNIT_STATE,
  LAYOUT_DEFAULTS,
  normalizeUnit,
  groupByFloor,
  layoutUnits,
  buildingBounds,
  deriveUnitState,
  stateColor,
  shouldEmissive,
  buildUnitStates,
  STATE_COLORS
} from '../assets/js/lib/units.js';

const units = (list) => list.map((u) => normalizeUnit(u, u.number));

test('normalizeUnit keeps well-formed data', () => {
  const u = normalizeUnit({ number: '201', floor: 2, type: 'triple', order: 1 }, '201');
  assert.equal(u.id, '201');
  assert.equal(u.number, '201');
  assert.equal(u.floor, 2);
  assert.equal(u.type, 'triple');
  assert.equal(u.order, 1);
});

test('normalizeUnit survives a malformed document', () => {
  const u = normalizeUnit({ floor: 'nonsense' }, '999');
  assert.equal(u.id, '999');
  assert.equal(u.floor, 1, 'a bad floor falls back to 1 rather than NaN');
  assert.equal(u.type, '');
});

test('normalizeUnit tolerates being called with nothing', () => {
  const u = normalizeUnit(null, undefined);
  assert.equal(u.number, '—');
  assert.equal(u.floor, 1);
});

test('floors stack in ascending order', () => {
  const grouped = groupByFloor(
    units([
      { number: '201', floor: 2 },
      { number: '101', floor: 1 }
    ])
  );
  assert.deepEqual(
    grouped.map((g) => g.floor),
    [1, 2]
  );
  assert.equal(grouped[0].units[0].number, '101');
});

test('units are ordered within a floor by order then number', () => {
  const grouped = groupByFloor(
    units([
      { number: '203', floor: 1, order: 2 },
      { number: '201', floor: 1, order: 0 },
      { number: '202', floor: 1, order: 1 }
    ])
  );
  assert.deepEqual(
    grouped[0].units.map((u) => u.number),
    ['201', '202', '203']
  );
});

test('units with no order fall back to numeric order', () => {
  const grouped = groupByFloor(
    units([
      { number: '203', floor: 1 },
      { number: '201', floor: 1 }
    ])
  );
  assert.deepEqual(
    grouped[0].units.map((u) => u.number),
    ['201', '203']
  );
});

test('layout places each floor at a different height', () => {
  const laid = layoutUnits(
    units([
      { number: '101', floor: 1 },
      { number: '201', floor: 2 }
    ])
  );
  const byNumber = Object.fromEntries(laid.map((u) => [u.number, u]));

  assert.equal(byNumber['101'].position.y, 0);
  assert.equal(byNumber['201'].position.y, LAYOUT_DEFAULTS.floorHeight);
});

test('units on the same floor share a height', () => {
  const laid = layoutUnits(
    units([
      { number: '101', floor: 1 },
      { number: '102', floor: 1 }
    ])
  );
  assert.equal(laid[0].position.y, laid[1].position.y);
});

test('units on the same floor do not overlap horizontally', () => {
  const laid = layoutUnits(
    units([
      { number: '101', floor: 1, order: 0 },
      { number: '102', floor: 1, order: 1 },
      { number: '103', floor: 1, order: 2 }
    ])
  );
  for (let i = 1; i < laid.length; i++) {
    const gap = laid[i].position.x - laid[i - 1].position.x;
    assert.ok(
      gap >= laid[i].size.width,
      `units ${i - 1} and ${i} overlap (gap ${gap} < width ${laid[i].size.width})`
    );
  }
});

test('a floor is centred around the origin', () => {
  const laid = layoutUnits(
    units([
      { number: '101', floor: 1 },
      { number: '102', floor: 1 }
    ])
  );
  const mid = (laid[0].position.x + laid[laid.length - 1].position.x) / 2;
  assert.ok(Math.abs(mid) < 0.001, `floor centre should sit on the origin, got ${mid}`);
});

test('layout is deterministic regardless of input order', () => {
  const a = layoutUnits(
    units([
      { number: '102', floor: 1, order: 1 },
      { number: '101', floor: 1, order: 0 }
    ])
  );
  const b = layoutUnits(
    units([
      { number: '101', floor: 1, order: 0 },
      { number: '102', floor: 1, order: 1 }
    ])
  );
  assert.deepEqual(
    a.map((u) => [u.number, u.position.x]),
    b.map((u) => [u.number, u.position.x])
  );
});

test('an empty building lays out to nothing', () => {
  assert.deepEqual(layoutUnits([]), []);
  assert.deepEqual(layoutUnits(null), []);
  assert.deepEqual(groupByFloor(null), []);
});

test('buildingBounds reports the tallest floor', () => {
  const bounds = buildingBounds(
    units([
      { number: '101', floor: 1 },
      { number: '301', floor: 3 }
    ])
  );
  assert.equal(bounds.floors, 3);
  assert.equal(bounds.height, 3 * LAYOUT_DEFAULTS.floorHeight);
});

test('buildingBounds of an empty building is zero', () => {
  assert.deepEqual(buildingBounds([]), { floors: 0, height: 0 });
});

test('an assigned tenant means Booked', () => {
  assert.equal(deriveUnitState('201', { tenantUnitIds: ['201'] }), UNIT_STATE.BOOKED);
});

test('an unassigned reservation means Pending', () => {
  assert.equal(deriveUnitState('201', { pendingUnitIds: ['201'] }), UNIT_STATE.PENDING);
});

test('an assigned tenant outranks a pending reservation', () => {
  const state = deriveUnitState('201', { tenantUnitIds: ['201'], pendingUnitIds: ['201'] });
  assert.equal(state, UNIT_STATE.BOOKED);
});

test('nothing assigned means Available', () => {
  assert.equal(deriveUnitState('201', {}), UNIT_STATE.AVAILABLE);
  assert.equal(deriveUnitState('201', { tenantUnitIds: ['999'] }), UNIT_STATE.AVAILABLE);
});

test('a unit id with no context is Available, not a crash', () => {
  assert.equal(deriveUnitState('', { tenantUnitIds: ['201'] }), UNIT_STATE.AVAILABLE);
  assert.equal(deriveUnitState(undefined), UNIT_STATE.AVAILABLE);
});

test('Sets and Arrays are both accepted for occupancy', () => {
  assert.equal(deriveUnitState('201', { tenantUnitIds: new Set(['201']) }), UNIT_STATE.BOOKED);
  assert.equal(deriveUnitState('201', { tenantUnitIds: ['201'] }), UNIT_STATE.BOOKED);
});

test('each state has a distinct colour', () => {
  const colors = new Set(Object.values(STATE_COLORS));
  assert.equal(colors.size, 3, 'available, pending and booked must be visually distinct');
});

test('an unknown state falls back to the available colour', () => {
  assert.equal(stateColor('Nonsense'), STATE_COLORS[UNIT_STATE.AVAILABLE]);
  assert.equal(stateColor(undefined), STATE_COLORS[UNIT_STATE.AVAILABLE]);
});

test('only occupied states glow', () => {
  assert.equal(shouldEmissive(UNIT_STATE.BOOKED), true);
  assert.equal(shouldEmissive(UNIT_STATE.PENDING), true);
  assert.equal(shouldEmissive(UNIT_STATE.AVAILABLE), false);
});

test('buildUnitStates pairs each unit with a state and colour', () => {
  const list = units([
    { number: '101', floor: 1 },
    { number: '102', floor: 1 },
    { number: '103', floor: 1 }
  ]);
  const states = buildUnitStates(list, { tenantUnitIds: ['102'], pendingUnitIds: ['103'] });

  assert.equal(states.length, 3);
  assert.equal(states[0].state, UNIT_STATE.AVAILABLE);
  assert.equal(states[1].state, UNIT_STATE.BOOKED);
  assert.equal(states[2].state, UNIT_STATE.PENDING);
  assert.equal(states[1].color, STATE_COLORS[UNIT_STATE.BOOKED]);
});

test('buildUnitStates of an empty building is empty', () => {
  assert.deepEqual(buildUnitStates([]), []);
});
