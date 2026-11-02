export const CURFEW_HOUR_START = 22; // 10:00 PM
export const CURFEW_HOUR_END = 5; // 5:00 AM
export const ABANDONMENT_THRESHOLD_DAYS = 7; // Flag as AWOL after 7 days away

/**
 * Determine if the given date/time falls within curfew hours (10:00 PM - 5:00 AM)
 */
export function isCurfewViolation(date = new Date()) {
  const hour = date.getHours();
  return hour >= CURFEW_HOUR_START || hour < CURFEW_HOUR_END;
}

/**
 * Calculate the number of whole days elapsed between a past ISO date string and now.
 */
export function computeDaysAway(lastTapAt, nowMs = Date.now()) {
  if (!lastTapAt) return 0;
  const tapDate = new Date(lastTapAt);
  if (isNaN(tapDate.getTime())) return 0;
  const diffMs = nowMs - tapDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Format a gate log timestamp into friendly 12-hour local time and date.
 */
export function formatGateTimestamp(isoString) {
  if (!isoString) return 'Never';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Never';

  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dateStr} at ${timeStr}`;
}

