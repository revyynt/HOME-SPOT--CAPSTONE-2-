/**
 * Pure calendar & future-payment schedule builder shared by Tenant Portal and Admin Dashboard.
 */

import { isRentPurpose } from './format.js';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

export function formatDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parsePaymentDate(payment) {
  if (!payment) return null;
  const raw = payment.paidAt || payment.createdAt || payment.dateFormatted;
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'object' && typeof raw.seconds === 'number') {
    return new Date(raw.seconds * 1000);
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('fail') || s.includes('decline') || s.includes('cancel')) return 'Failed';
  if (s === 'paid' || s === 'succeeded') return 'Paid';
  return 'Pending';
}

function matchesTenant(payment, tenant) {
  const pEmail = String(payment.tenantEmail || payment.email || '')
    .trim()
    .toLowerCase();
  const tEmail = String(tenant.email || '')
    .trim()
    .toLowerCase();
  if (pEmail && tEmail && pEmail === tEmail) return true;
  if (payment.tenantUid && tenant.uid && payment.tenantUid === tenant.uid) return true;
  const pName = String(payment.tenantName || '')
    .trim()
    .toLowerCase();
  const tName = String(tenant.name || '')
    .trim()
    .toLowerCase();
  return Boolean(pName && tName && pName === tName);
}

function getPaymentsForMonth(payments, tenant, year, month) {
  const targetMonthName = MONTH_NAMES[month].toLowerCase();
  const rawDueDay = Math.max(1, Math.min(31, parseInt(tenant.dueDay, 10) || 5));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dueDay = Math.min(rawDueDay, daysInMonth);
  const targetDueDate = new Date(year, month, dueDay);

  const prevMonthDate = new Date(year, month - 1, 1);
  const prevDays = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
  const prevDueDay = Math.min(rawDueDay, prevDays);
  const prevDueDate = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), prevDueDay);

  return payments.filter((p) => {
    if (normalizeStatus(p.status) !== 'Paid') return false;
    if (!matchesTenant(p, tenant)) return false;
    if (!isRentPurpose(p.purpose)) return false;

    const notesText = String(p.notes || '').toLowerCase();

    // 1. If notes explicitly specifies target month (e.g. "Advance Rent for December 5, 2026"), it matches
    if (notesText.includes(targetMonthName)) return true;

    // If notes explicitly mentions another month (e.g. "december"), do not allocate to this month
    const mentionsOtherMonth = MONTH_NAMES.some((m) => {
      const mn = m.toLowerCase();
      return mn !== targetMonthName && notesText.includes(mn);
    });
    if (mentionsOtherMonth) return false;

    // 2. Transaction date matching
    const dt = parsePaymentDate(p);
    if (!dt) return false;

    // If paid in the calendar month of target
    if (dt.getFullYear() === year && dt.getMonth() === month) return true;

    // If paid within the billing cycle window (between previous due date and target due date)
    const pTime = dt.getTime();
    if (pTime > prevDueDate.getTime() && pTime <= targetDueDate.getTime()) {
      return true;
    }

    return false;
  });
}

function isDueDateBeforeMoveIn(dueDateObj, moveInDateStr) {
  if (!moveInDateStr) return false;
  const d = new Date(moveInDateStr);
  if (Number.isNaN(d.getTime())) return false;
  const moveInStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return dueDateObj.getTime() < moveInStart;
}

function isBeforeMoveIn(year, month, moveInDateStr) {
  if (!moveInDateStr) return false;
  const d = new Date(moveInDateStr);
  if (Number.isNaN(d.getTime())) return false;
  return year < d.getFullYear() || (year === d.getFullYear() && month < d.getMonth());
}

/**
 * Builds a 42-cell month calendar grid, monthly summary, and upcoming future schedule.
 *
 * @param {Object} options
 * @param {Array<Object>} [options.tenants]
 * @param {Array<Object>} [options.payments]
 * @param {number} options.year
 * @param {number} options.month 0-indexed (0 = Jan, 11 = Dec)
 * @param {Date} [options.today]
 * @param {string} [options.tenantFilter] email or id to filter by
 */
export function buildPaymentCalendar({
  tenants = [],
  payments = [],
  year,
  month,
  today = new Date(),
  tenantFilter = ''
}) {
  const filterKey = String(tenantFilter || '')
    .trim()
    .toLowerCase();
  const activeTenants = tenants.filter((t) => {
    if ((t.status || 'Active') === 'Archived') return false;
    if (!filterKey) return true;
    return (
      String(t.id || '').toLowerCase() === filterKey ||
      String(t.email || '')
        .trim()
        .toLowerCase() === filterKey ||
      String(t.name || '')
        .trim()
        .toLowerCase() === filterKey
    );
  });

  const filteredPayments = payments.filter((p) => {
    if (!filterKey) return true;
    const matchT = activeTenants.find((t) => matchesTenant(p, t));
    return (
      Boolean(matchT) ||
      String(p.tenantEmail || '')
        .trim()
        .toLowerCase() === filterKey
    );
  });

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 (Sun) .. 6 (Sat)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDate = today.getDate();
  const todayStart = new Date(todayYear, todayMonth, todayDate).getTime();

  const cellsByKey = new Map();
  const days = [];

  for (let i = 0; i < 42; i++) {
    let cellYear = year;
    let cellMonth = month;
    let dayNum = i - startOffset + 1;
    let inCurrentMonth = true;

    if (dayNum <= 0) {
      inCurrentMonth = false;
      cellMonth = month - 1;
      if (cellMonth < 0) {
        cellMonth = 11;
        cellYear -= 1;
      }
      dayNum = prevMonthDays + dayNum;
    } else if (dayNum > daysInMonth) {
      inCurrentMonth = false;
      dayNum = dayNum - daysInMonth;
      cellMonth = month + 1;
      if (cellMonth > 11) {
        cellMonth = 0;
        cellYear += 1;
      }
    }

    const dateKey = formatDateKey(cellYear, cellMonth, dayNum);
    const cell = {
      dateKey,
      year: cellYear,
      month: cellMonth,
      dayNumber: dayNum,
      inCurrentMonth,
      isToday: cellYear === todayYear && cellMonth === todayMonth && dayNum === todayDate,
      dueEvents: [],
      paymentEvents: []
    };
    days.push(cell);
    cellsByKey.set(dateKey, cell);
  }

  // Place actual payment transactions onto the calendar
  for (const p of filteredPayments) {
    const dt = parsePaymentDate(p);
    if (!dt) continue;
    const key = formatDateKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const cell = cellsByKey.get(key);
    if (cell) {
      cell.paymentEvents.push({
        id: p.id || p.referenceNumber || key,
        tenantName: p.tenantName || 'Tenant',
        tenantEmail: p.tenantEmail || '',
        amount: Number(p.amount) || 0,
        purpose: p.purpose || 'Monthly Rent',
        notes: p.notes || '',
        method: p.method || p.paymentMethod || 'PayMongo',
        referenceNumber: p.referenceNumber || '',
        status: normalizeStatus(p.status),
        dateKey: key,
        raw: p
      });
    }
  }

  let totalExpected = 0;
  let totalPaid = 0;
  let totalOverdue = 0;
  const roomBreakdownMap = {};
  const rows = [];

  const isCurrentMonth = year === todayYear && month === todayMonth;
  const isFutureMonth = year > todayYear || (year === todayYear && month > todayMonth);

  for (const tenant of activeTenants) {
    if (isBeforeMoveIn(year, month, tenant.moveInDate)) continue;

    const rent = Number(tenant.monthlyRent) || 0;
    const rawDueDay = Math.max(1, Math.min(31, parseInt(tenant.dueDay, 10) || 5));
    const dueDay = Math.min(rawDueDay, daysInMonth);
    const dueDateObj = new Date(year, month, dueDay);
    const dueDateKey = formatDateKey(year, month, dueDay);
    const dueDateFormatted = `${SHORT_MONTHS[month]} ${dueDay}, ${year}`;
    const isMoveInMonthDuePassed = isDueDateBeforeMoveIn(dueDateObj, tenant.moveInDate);

    const monthPaidPayments = getPaymentsForMonth(filteredPayments, tenant, year, month);

    const paidSum = monthPaidPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const explicitSettled =
      isCurrentMonth &&
      tenant.amountDue !== undefined &&
      tenant.amountDue !== null &&
      Number(tenant.amountDue) <= 0;

    const isSettled = explicitSettled || (rent > 0 && paidSum >= rent);
    const effectivePaid = isSettled ? Math.max(rent, paidSum) : paidSum;
    const remaining = isSettled
      ? 0
      : isCurrentMonth && tenant.amountDue !== undefined && tenant.amountDue !== null
        ? Math.max(0, Number(tenant.amountDue))
        : Math.max(0, rent - paidSum);

    let status = 'Pending';
    if (isSettled) {
      status = 'Paid';
    } else if (isMoveInMonthDuePassed) {
      status = 'Scheduled';
    } else if (dueDateObj.getTime() < todayStart) {
      status = 'Overdue';
    } else if (isFutureMonth) {
      status = 'Scheduled';
    }

    totalExpected += rent;
    totalPaid += effectivePaid;
    if (status === 'Overdue') {
      totalOverdue += remaining;
    }

    const roomName = tenant.room || 'Unassigned';
    if (!roomBreakdownMap[roomName]) {
      roomBreakdownMap[roomName] = { room: roomName, expected: 0, paid: 0, overdue: 0 };
    }
    roomBreakdownMap[roomName].expected += rent;
    roomBreakdownMap[roomName].paid += effectivePaid;
    if (status === 'Overdue') {
      roomBreakdownMap[roomName].overdue += remaining;
    }

    const dueEvent = {
      tenantId: tenant.id || tenant.email || tenant.name,
      tenantName: tenant.name || 'Tenant',
      tenantEmail: tenant.email || '',
      room: tenant.room || 'Unassigned',
      dormName: tenant.dormName || '',
      amount: rent,
      remaining,
      paidAmount: effectivePaid,
      dueDay,
      dueDate: dueDateFormatted,
      dateKey: dueDateKey,
      status
    };

    rows.push(dueEvent);
    if (!isMoveInMonthDuePassed) {
      const targetCell = cellsByKey.get(dueDateKey);
      if (targetCell) {
        targetCell.dueEvents.push(dueEvent);
      }
    }
  }

  // Place move-in day milestone markers on the calendar
  for (const tenant of activeTenants) {
    if (!tenant.moveInDate) continue;
    if (
      tenant.movedIn === true ||
      tenant.movedIn === 'true' ||
      tenant.moveInCompleted === true ||
      tenant.moveInCompleted === 'true'
    ) {
      continue;
    }
    const mDate = new Date(tenant.moveInDate);
    if (Number.isNaN(mDate.getTime())) continue;
    if (mDate.getFullYear() === year && mDate.getMonth() === month) {
      const mDay = mDate.getDate();
      const mKey = formatDateKey(year, month, mDay);
      const targetCell = cellsByKey.get(mKey);
      if (targetCell) {
        targetCell.dueEvents.push({
          tenantId: tenant.id || tenant.email || tenant.name,
          tenantName: tenant.name || 'Tenant',
          tenantEmail: tenant.email || '',
          room: tenant.room || 'Unassigned',
          dormName: tenant.dormName || '',
          amount: 0,
          remaining: 0,
          paidAmount: 0,
          dueDay: mDay,
          dueDate: `${SHORT_MONTHS[month]} ${mDay}, ${year}`,
          dateKey: mKey,
          status: 'MoveIn',
          isMoveInMarker: true
        });
      }
    }
  }

  // Build upcoming future schedule (current month if unpaid + next 3 future months)
  const upcomingSchedule = [];
  for (let offset = 0; offset <= 3; offset++) {
    const d = new Date(todayYear, todayMonth + offset, 1);
    const uYear = d.getFullYear();
    const uMonth = d.getMonth();
    const uDaysInMonth = new Date(uYear, uMonth + 1, 0).getDate();

    for (const tenant of activeTenants) {
      if (isBeforeMoveIn(uYear, uMonth, tenant.moveInDate)) continue;
      const rent = Number(tenant.monthlyRent) || 0;
      const rawDueDay = Math.max(1, Math.min(31, parseInt(tenant.dueDay, 10) || 5));
      const dueDay = Math.min(rawDueDay, uDaysInMonth);
      const dueDateObj = new Date(uYear, uMonth, dueDay);
      if (isDueDateBeforeMoveIn(dueDateObj, tenant.moveInDate)) continue;

      const paidInTargetMonth = getPaymentsForMonth(filteredPayments, tenant, uYear, uMonth).reduce(
        (s, p) => s + (Number(p.amount) || 0),
        0
      );

      const isSettledByAmountDue =
        Boolean(tenant.settledDueDate && tenant.settledDueDate.includes(MONTH_NAMES[uMonth])) &&
        tenant.amountDue !== undefined &&
        tenant.amountDue !== null &&
        Number(tenant.amountDue) <= 0;

      const settledInCurrent =
        offset === 0 &&
        tenant.amountDue !== undefined &&
        tenant.amountDue !== null &&
        Number(tenant.amountDue) <= 0;

      const isPaid =
        isSettledByAmountDue || settledInCurrent || (rent > 0 && paidInTargetMonth >= rent);
      if (offset === 0 && isPaid && !isSettledByAmountDue) continue;

      const status = isPaid
        ? 'Settled'
        : dueDateObj.getTime() < todayStart
          ? 'Overdue'
          : offset === 0
            ? 'Due Soon'
            : 'Scheduled';

      const remainingAmount = isPaid
        ? 0
        : offset === 0 && tenant.amountDue != null
          ? Math.max(0, Number(tenant.amountDue))
          : Math.max(0, rent - paidInTargetMonth);

      upcomingSchedule.push({
        tenantName: tenant.name || 'Tenant',
        room: tenant.room || 'Unassigned',
        dueDate: `${MONTH_NAMES[uMonth]} ${dueDay}, ${uYear}`,
        dateKey: formatDateKey(uYear, uMonth, dueDay),
        year: uYear,
        month: uMonth,
        amount: remainingAmount,
        originalAmount: rent,
        isSettled: isPaid,
        status: status
      });
    }
  }

  const collectionRate =
    totalExpected > 0
      ? Math.min(100, Math.round((totalPaid / totalExpected) * 100))
      : totalPaid > 0
        ? 100
        : 0;
  const totalPending = Math.max(0, totalExpected - totalPaid - totalOverdue);

  return {
    monthLabel: `${MONTH_NAMES[month]} ${year}`,
    year,
    month,
    days,
    monthSummary: {
      totalExpected,
      totalPaid,
      totalOverdue,
      totalPending,
      collectionRate,
      roomBreakdown: Object.values(roomBreakdownMap),
      rows
    },
    upcomingSchedule: upcomingSchedule.slice(0, 6)
  };
}

/**
 * Computes forward-looking sales & revenue forecast for the next N months.
 *
 * @param {Object} options
 * @param {Array<Object>} [options.tenants]
 * @param {number} [options.monthsAhead=6]
 * @param {Date} [options.today]
 * @returns {Object}
 */
export function buildSalesForecast({ tenants = [], monthsAhead = 6, today = new Date() }) {
  const activeTenants = tenants.filter((t) => (t.status || 'Active') !== 'Archived');
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();

  const monthlyRunRate = activeTenants.reduce((sum, t) => sum + (Number(t.monthlyRent) || 0), 0);

  const months = [];
  let totalProjectedInflow = 0;

  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(todayYear, todayMonth + i, 1);
    const targetYear = d.getFullYear();
    const targetMonth = d.getMonth();
    const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
    const label = `${SHORT_MONTHS[targetMonth]} ${targetYear}`;

    let projectedAmount = 0;
    let tenantCount = 0;
    const roomBreakdown = {};

    for (const t of activeTenants) {
      if (isBeforeMoveIn(targetYear, targetMonth, t.moveInDate)) continue;
      const rent = Number(t.monthlyRent) || 0;
      projectedAmount += rent;
      tenantCount++;
      const room = t.room || 'Other';
      roomBreakdown[room] = (roomBreakdown[room] || 0) + rent;
    }

    totalProjectedInflow += projectedAmount;
    months.push({
      monthKey,
      label,
      year: targetYear,
      month: targetMonth,
      isCurrentMonth: i === 0,
      projectedAmount,
      tenantCount,
      roomBreakdown
    });
  }

  const maxProjected = Math.max(...months.map((m) => m.projectedAmount), 1);

  return {
    monthlyRunRate,
    totalProjectedInflow,
    projectedMonths: months,
    maxProjected,
    activeTenantCount: activeTenants.length
  };
}
