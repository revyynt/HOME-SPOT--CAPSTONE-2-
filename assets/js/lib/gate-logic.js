export const CURFEW_HOUR_START = 22; // 10:00 PM
export const CURFEW_HOUR_END = 5; // 5:00 AM
export const ABANDONMENT_THRESHOLD_DAYS = 7; // Flag as AWOL after 7 days away
export const GATE_TIMEZONE = 'Asia/Manila';

function parseGateDate(input = new Date()) {
  if (input instanceof Date) return input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)) {
      return new Date(`${trimmed}+08:00`);
    }
  }
  return new Date(input);
}

function getManilaHour(date = new Date()) {
  const d = parseGateDate(date);
  if (isNaN(d.getTime())) return 12;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: GATE_TIMEZONE,
      hour: 'numeric',
      hour12: false
    }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    if (Number.isFinite(h)) return h === 24 ? 0 : h;
  } catch {}
  return d.getHours();
}

/**
 * Determine if the given date/time falls within curfew hours (10:00 PM - 5:00 AM PHT)
 */
export function isCurfewViolation(date = new Date()) {
  const hour = getManilaHour(date);
  return hour >= CURFEW_HOUR_START || hour < CURFEW_HOUR_END;
}

/**
 * Calculate the number of whole days elapsed between a past ISO date string and now.
 */
export function computeDaysAway(lastTapAt, nowMs = Date.now()) {
  if (!lastTapAt) return 0;
  const tapDate = parseGateDate(lastTapAt);
  if (isNaN(tapDate.getTime())) return 0;
  const diffMs = nowMs - tapDate.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Format a gate log timestamp into friendly 12-hour Philippine Standard Time (Asia/Manila).
 */
export function formatGateTimestamp(isoString) {
  if (!isoString) return 'Never';
  const d = parseGateDate(isoString);
  if (isNaN(d.getTime())) return 'Never';

  const dateStr = d.toLocaleDateString('en-US', {
    timeZone: GATE_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: GATE_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return `${dateStr} at ${timeStr}`;
}
