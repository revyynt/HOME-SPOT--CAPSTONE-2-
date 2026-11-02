import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeDaysAway,
  isCurfewViolation,
  formatGateTimestamp,
  CURFEW_HOUR_START,
  CURFEW_HOUR_END,
  ABANDONMENT_THRESHOLD_DAYS
} from '../assets/js/lib/gate-logic.js';

test('isCurfewViolation identifies night hours as curfew violations', () => {
  const lateNight = new Date('2026-11-01T23:15:00');
  assert.equal(isCurfewViolation(lateNight), true, '11:15 PM should be curfew violation');

  const midnight = new Date('2026-11-01T00:30:00');
  assert.equal(isCurfewViolation(midnight), true, '12:30 AM should be curfew violation');

  const earlyMorning = new Date('2026-11-01T04:45:00');
  assert.equal(isCurfewViolation(earlyMorning), true, '4:45 AM should be curfew violation');

  const normalDay = new Date('2026-11-01T14:00:00');
  assert.equal(isCurfewViolation(normalDay), false, '2:00 PM should NOT be curfew violation');

  const eveningBeforeCurfew = new Date('2026-11-01T21:45:00');
  assert.equal(isCurfewViolation(eveningBeforeCurfew), false, '9:45 PM should NOT be curfew violation');
});

test('computeDaysAway computes accurate days elapsed from timestamp', () => {
  assert.equal(computeDaysAway(null), 0);
  assert.equal(computeDaysAway(''), 0);
  assert.equal(computeDaysAway('invalid-date'), 0);

  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(computeDaysAway(threeDaysAgo), 3);

  const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(computeDaysAway(tenDaysAgo), 10);
  assert.ok(computeDaysAway(tenDaysAgo) >= ABANDONMENT_THRESHOLD_DAYS, '10 days should trigger abandonment threshold');

  assert.equal(CURFEW_HOUR_START, 22);
  assert.equal(CURFEW_HOUR_END, 5);
  assert.match(formatGateTimestamp('2026-11-01T21:00:00'), /Nov 1/);
  assert.equal(formatGateTimestamp(null), 'Never');
});
