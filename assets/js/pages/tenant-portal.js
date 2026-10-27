/**
 * Tenant portal.
 *
 * Lifted out of a ~1200-line inline classic script. Two things changed beyond
 * the move:
 *
 *   - The auth guard no longer reads a `let userEmail` declared in a classic
 *     script and reassigned from a module. That only worked by accident of
 *     execution order. Identity now comes from the verified Supabase user.
 *   - Row/tab/modal actions are delegated from data-* attributes, so module
 *     scope stays private instead of being published wholesale to window.
 */

import { guardPage } from '../lib/guard.js';
import { initBackButtonGuard, logoutStaff } from '../lib/session.js';
import { getCurrentUser, supabaseData, supabase } from '../supabase-service.js';
import { interpretPaymentIntent } from '../lib/payment-return.js';
import * as PayMongo from '../paymongo-service.js';
import {
  escapeHtml,
  isValidPhilippinePhone,
  normalizePhilippinePhone
} from '../lib/format.js';
import { buildPaymentCalendar } from '../lib/payment-calendar.js';
import { DEFAULT_ROOMS, mergeRoomData } from '../lib/rooms.js';
import {
  initBuilding3DViewer,
  BUILDING_UNITS,
  resolveBuildingUnit,
  syncBuildingUnitsWithRooms
} from '../lib/building-3d.js';
import { Toast } from '../render/toast.js';

// TODO(refactor): checkUrlPaymentReturn still carries its own parameter
// parsing and scenario cascade. The tested decision logic already exists in
// ../lib/payment-return.js (resolveReturnScenario / interpretCheckoutSession /
// buildReturnRecord / shouldExpireSession) and should replace it -- the pure
// function is covered by tests/payment-return.test.js. Only
// interpretPaymentIntent has been swapped in so far. Do this as one change,
// with a manual walkthrough of all four return paths.

// Hide the portal until the session check resolves.
document.documentElement.dataset.authPending = 'true';

initBackButtonGuard('tenant');

const authReady = guardPage({
  role: 'tenant',
  redirectTo: 'login.html',
  grantedEvent: 'tenant-access-granted'
}).then(async (allowed) => {
  if (!allowed) return;
  // The session email must belong to the verified account.
  const user = await getCurrentUser();
  if (user && userEmail !== user.email) {
    userEmail = user.email || '';
    sessionStorage.setItem('tenantEmail', userEmail);
    populateTenantUI();
  }
  subscribeTenantMessages();
});

// Content stays hidden until the Supabase auth guard resolves.

let userEmail = sessionStorage.getItem('tenantEmail') || '';
let tenantName = sessionStorage.getItem('tenantName') || 'Juan Dela Cruz';
let tenantPhone = sessionStorage.getItem('tenantPhone') || '+63 912 345 6789';
let tenantRoom = sessionStorage.getItem('tenantRoom') || 'Room 201';
let tenantDorm = sessionStorage.getItem('tenantDorm') || 'Triple Occupancy Room';
let tenantMoveIn = sessionStorage.getItem('tenantMoveInDate') || 'January 10, 2026';
let tenantRent = parseFloat(sessionStorage.getItem('tenantMonthlyRent')) || 5000;
let tenantEmergency = sessionStorage.getItem('tenantEmergencyContact') || '+63 923 456 7890';
let tenantDueDay = parseInt(sessionStorage.getItem('tenantDueDay')) || 5;
let tenantMovedIn = sessionStorage.getItem('tenantMovedIn') === 'true';
let currentTenantDocId = sessionStorage.getItem('tenantDocId') || null;

// Global State
let activeQrPaymentData = null;
let qrTimerInterval = null;
let qrStatusPollInterval = null;
let tenantExplicitAmountDueSet = false;
let cachedPayments = [];

// Restore initial remaining due from session or local storage
let initialDue =
  sessionStorage.getItem('tenantAmountDue') ??
  localStorage.getItem('tenant_amount_due_' + userEmail);
let currentRemainingDue =
  initialDue !== null && !isNaN(parseFloat(initialDue)) ? parseFloat(initialDue) : tenantRent;
if (initialDue !== null && !isNaN(parseFloat(initialDue))) {
  tenantExplicitAmountDueSet = true;
}

function getMoveInInfo() {
  if (tenantMovedIn) {
    const parsed = tenantMoveIn ? new Date(tenantMoveIn) : null;
    return {
      isPending: false,
      moveInDate: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
      moveInStart: 0,
      todayStart: Date.now()
    };
  }
  if (!tenantMoveIn) return { isPending: false, moveInDate: null };
  const parsed = new Date(tenantMoveIn);
  if (Number.isNaN(parsed.getTime())) return { isPending: false, moveInDate: null };
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const moveInStart = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  return {
    isPending: moveInStart > todayStart,
    moveInDate: parsed,
    moveInStart,
    todayStart
  };
}

function updateAmountDueUI() {
  const moveInInfo = getMoveInInfo();
  const summaryAmountDue = document.getElementById('summaryAmountDue');
  if (summaryAmountDue) {
    if (moveInInfo.isPending) {
      summaryAmountDue.textContent =
        '₱' + tenantRent.toLocaleString(undefined, { minimumFractionDigits: 2 }) + ' (Scheduled)';
      summaryAmountDue.style.color = '#0284c7';
    } else if (currentRemainingDue <= 0) {
      summaryAmountDue.textContent = '₱0.00 (Settled)';
      summaryAmountDue.style.color = '#15803d';
    } else {
      summaryAmountDue.textContent =
        '₱' + currentRemainingDue.toLocaleString(undefined, { minimumFractionDigits: 2 });
      summaryAmountDue.style.color = '#059669';
    }
  }

  const summaryDueDate = document.getElementById('summaryDueDate');
  if (summaryDueDate) {
    const now = new Date();
    const dueDay = tenantDueDay || 5;
    const monthNames = [
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
    let checkYear = now.getFullYear();
    let checkMonth = now.getMonth();

    if (
      moveInInfo.moveInDate &&
      (moveInInfo.moveInDate.getFullYear() > checkYear ||
        (moveInInfo.moveInDate.getFullYear() === checkYear &&
          moveInInfo.moveInDate.getMonth() > checkMonth))
    ) {
      checkYear = moveInInfo.moveInDate.getFullYear();
      checkMonth = moveInInfo.moveInDate.getMonth();
    }

    const daysInM = new Date(checkYear, checkMonth + 1, 0).getDate();
    let candidate = new Date(checkYear, checkMonth, Math.min(dueDay, daysInM));

    if (
      (moveInInfo.moveInStart && candidate.getTime() < moveInInfo.moveInStart) ||
      currentRemainingDue <= 0
    ) {
      checkMonth++;
      if (checkMonth > 11) {
        checkMonth = 0;
        checkYear++;
      }
      const nextDays = new Date(checkYear, checkMonth + 1, 0).getDate();
      candidate = new Date(checkYear, checkMonth, Math.min(dueDay, nextDays));
    }

    summaryDueDate.textContent = moveInInfo.isPending
      ? `${monthNames[candidate.getMonth()]} ${candidate.getDate()}, ${candidate.getFullYear()} (First Due)`
      : `${monthNames[candidate.getMonth()]} ${candidate.getDate()}, ${candidate.getFullYear()}`;
  }

  const paymentAmountInput = document.getElementById('paymentAmount');
  if (paymentAmountInput) {
    if (currentRemainingDue <= 0) {
      paymentAmountInput.value = '0';
      paymentAmountInput.placeholder = '0.00 (Rent Settled)';
    } else if (
      !paymentAmountInput.value ||
      paymentAmountInput.value === '5000' ||
      parseFloat(paymentAmountInput.value) > currentRemainingDue
    ) {
      paymentAmountInput.value = currentRemainingDue.toString();
    }
    if (typeof updateSubmitButton === 'function') {
      updateSubmitButton();
    }
  }
}

function populateTenantUI() {
  const userEmailEl = document.getElementById('userEmail');
  if (userEmailEl) userEmailEl.textContent = userEmail;

  const emailInput = document.getElementById('email');
  if (emailInput) emailInput.value = userEmail;

  const nameInput = document.getElementById('fullName');
  if (nameInput) nameInput.value = tenantName;

  const phoneInput = document.getElementById('phone');
  if (phoneInput) phoneInput.value = tenantPhone;

  const emergencyInput = document.getElementById('emergencyContact');
  if (emergencyInput) emergencyInput.value = tenantEmergency;

  const dormInput = document.getElementById('tenantProfileDorm');
  if (dormInput) dormInput.value = tenantDorm;

  const roomInput = document.getElementById('tenantProfileRoom');
  if (roomInput) roomInput.value = tenantRoom;

  const moveInInput = document.getElementById('tenantProfileMoveIn');
  if (moveInInput) moveInInput.value = tenantMoveIn;

  const summaryResidence = document.getElementById('summaryResidence');
  if (summaryResidence) summaryResidence.textContent = `${tenantDorm} (${tenantRoom})`;

  const summaryRent = document.getElementById('summaryRent');
  if (summaryRent) summaryRent.textContent = '₱' + tenantRent.toLocaleString() + '.00';

  const welcomeTenantName = document.getElementById('welcomeTenantName');
  if (welcomeTenantName) welcomeTenantName.textContent = `Welcome back, ${tenantName}! 👋`;

  const welcomeTenantSub = document.getElementById('welcomeTenantSub');
  if (welcomeTenantSub) welcomeTenantSub.textContent = `${tenantRoom} • ${tenantDorm}`;

  const welcomeAvatar = document.getElementById('welcomeAvatar');
  if (welcomeAvatar) {
    const initials = (tenantName || 'Juan Dela Cruz')
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
    welcomeAvatar.textContent = initials || 'JD';
  }

  const statusPill = document.querySelector('.tenant-status-pill');
  const moveInInfo = getMoveInInfo();
  if (statusPill) {
    if (moveInInfo.isPending) {
      statusPill.textContent = '● Pending Move-In';
      statusPill.style.background = '#fef3c7';
      statusPill.style.color = '#92400e';
      statusPill.style.border = '1px solid #fde68a';
    } else {
      statusPill.textContent = '● Active Resident';
      statusPill.style.background = '';
      statusPill.style.color = '';
      statusPill.style.border = '';
    }
  }

  updateAmountDueUI();
  renderTenantPaymentCalendar();
  syncTenant3DBuildingState();

  const receiptTenantName = document.getElementById('receiptTenantName');
  if (receiptTenantName) receiptTenantName.textContent = tenantName;
}

let tenantBuilding3D = null;
let tenantSelected3DUnitId = '';
let tenant3DXrayEnabled = true;
let tenant3DSpinEnabled = true;

function renderTenant3DUnitInspector(unit) {
  if (!unit) return;
  const ownUnit = resolveBuildingUnit(tenantRoom, tenantDorm);
  const isOwnUnit = ownUnit && ownUnit.id === unit.id;

  const badgeEl = document.getElementById('tenant3DUnitBadge');
  if (badgeEl) {
    badgeEl.textContent = isOwnUnit ? '● YOUR ASSIGNED UNIT' : `${unit.floorLabel.toUpperCase()} UNIT`;
    badgeEl.style.background = isOwnUnit ? '#d1fae5' : '#e0f2fe';
    badgeEl.style.color = isOwnUnit ? '#065f46' : '#0369a1';
  }

  const titleEl = document.getElementById('tenant3DUnitTitle');
  if (titleEl) {
    titleEl.textContent =
      isOwnUnit && tenantRoom && tenantRoom.toLowerCase() !== unit.name.toLowerCase()
        ? `${unit.name} (${tenantRoom})`
        : unit.name;
  }

  const subEl = document.getElementById('tenant3DUnitSubtitle');
  if (subEl) {
    subEl.textContent = `${unit.floorLabel} (${unit.wing || unit.positionLabel}) • ${unit.type}`;
  }

  const floorEl = document.getElementById('tenant3DUnitFloor');
  if (floorEl) floorEl.textContent = unit.floorLabel;

  const sizeEl = document.getElementById('tenant3DUnitSize');
  if (sizeEl) sizeEl.textContent = unit.size;

  const capEl = document.getElementById('tenant3DUnitCap');
  if (capEl) {
    capEl.textContent =
      unit.type === 'Commercial Space' ? 'Commercial Utility' : `${unit.capacity} Occupants`;
  }

  const priceEl = document.getElementById('tenant3DUnitPrice');
  if (priceEl) {
    const rate = unit.price || (isOwnUnit && tenantRent ? tenantRent : 10000);
    priceEl.textContent = `₱${Number(rate).toLocaleString()}/mo`;
  }

  const descEl = document.getElementById('tenant3DUnitDesc');
  if (descEl) {
    descEl.textContent =
      unit.description ||
      (unit.type === 'Commercial Space'
        ? "1st Floor center-right storefront under the white canopy overhang — separated from the owner's MJ Parungao Purified Water Station on the left and the gated side hallway on the right."
        : `${unit.floorLabel} (${unit.wing || unit.positionLabel}) Triple Occupancy Room accessed from the right-side chevron-tiled hallway with red fire hose cabinet, sliding windows, 3 bed spaces, private bathroom, and staircase at the rear end of the hallway.`);
  }

  const featsEl = document.getElementById('tenant3DUnitFeatures');
  if (featsEl) {
    const combinedFeats = Array.from(
      new Set([...(unit.listingFeatures || []), ...(unit.features || [])])
    );
    featsEl.innerHTML = combinedFeats
      .map((f) => `<span class="building-3d-chip">${escapeHtml(f)}</span>`)
      .join('');
  }

  const listEl = document.getElementById('tenant3DUnitList');
  if (listEl) {
    listEl.innerHTML = BUILDING_UNITS.map((u) => {
      const isMine = ownUnit && ownUnit.id === u.id;
      const isSelected = u.id === unit.id;
      return `
        <button type="button" class="building-3d-dir-item ${isSelected ? 'active' : ''}" data-action="tenant-3d-select-unit" data-unit-id="${escapeHtml(u.id)}">
          <div>
            <strong style="color:#0f172a">${escapeHtml(u.id)}</strong>
            <span style="color:#64748b;font-size:12px;margin-left:6px">${escapeHtml(u.floorLabel)} • ${escapeHtml(u.wing)}</span>
          </div>
          <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:${isMine ? '#d1fae5' : '#f1f5f9'};color:${isMine ? '#065f46' : '#475569'}">
            ${isMine ? 'My Room' : escapeHtml(u.type === 'Commercial Space' ? '1F Commercial' : 'Triple Room')}
          </span>
        </button>`;
    }).join('');
  }
}

function syncTenant3DBuildingState() {
  subscribeTenant3DRooms();
  const ownUnit = resolveBuildingUnit(tenantRoom, tenantDorm) || BUILDING_UNITS[4];
  if (!tenantSelected3DUnitId && ownUnit) {
    tenantSelected3DUnitId = ownUnit.id;
  }
  const activeUnit =
    BUILDING_UNITS.find((u) => u.id === tenantSelected3DUnitId) || ownUnit || BUILDING_UNITS[0];
  renderTenant3DUnitInspector(activeUnit);

  if (tenantBuilding3D) {
    tenantBuilding3D.setTenantUnit(tenantRoom, tenantDorm);
    tenantBuilding3D.selectUnit(activeUnit.id);
  }
}

let tenant3DRoomsSubscribed = false;

function subscribeTenant3DRooms() {
  if (tenant3DRoomsSubscribed) return;
  tenant3DRoomsSubscribed = true;
  try {
    supabaseData.onSnapshot(
      supabaseData.collection(supabase, 'rooms'),
      (snap) => {
        const rooms = [];
        snap.forEach((doc) => {
          rooms.push(mergeRoomData(doc.id, { id: doc.id, ...doc.data() }));
        });
        syncBuildingUnitsWithRooms(rooms.length ? rooms : DEFAULT_ROOMS);
        syncTenant3DBuildingState();
      },
      (err) => console.warn('Tenant 3D rooms listener error:', err)
    );
  } catch (err) {
    console.warn('Could not subscribe to rooms for 3D viewer:', err);
  }
}

function ensureTenantBuilding3DInitialized() {
  subscribeTenant3DRooms();
  const viewport = document.getElementById('tenantBuilding3DViewport');
  if (!viewport) return;
  if (!tenantBuilding3D) {
    const ownUnit = resolveBuildingUnit(tenantRoom, tenantDorm) || BUILDING_UNITS[4];
    tenantSelected3DUnitId = ownUnit.id;
    tenantBuilding3D = initBuilding3DViewer(viewport, {
      mode: 'tenant',
      tenantRoom,
      tenantDorm,
      onSelectUnit: (unit) => {
        tenantSelected3DUnitId = unit.id;
        renderTenant3DUnitInspector(unit);
      }
    });
    renderTenant3DUnitInspector(ownUnit);
  } else {
    tenantBuilding3D.resize();
    syncTenant3DBuildingState();
  }
}

let tenantCalYear = new Date().getFullYear();
let tenantCalMonth = new Date().getMonth();
let tenantSelectedDateKey = '';

function renderTenantPaymentCalendar() {
  const gridEl = document.getElementById('tenantCalendarGrid');
  const monthLabelEl = document.getElementById('tenantCalendarMonthLabel');
  const upcomingEl = document.getElementById('tenantUpcomingScheduleList');
  const detailEl = document.getElementById('tenantCalendarDayDetail');
  if (!gridEl || !monthLabelEl) return;

  const tenantRecord = {
    id: currentTenantDocId || userEmail || 'tenant',
    name: tenantName,
    email: userEmail,
    room: tenantRoom,
    dormName: tenantDorm,
    monthlyRent: tenantRent,
    dueDay: tenantDueDay,
    moveInDate: tenantMoveIn,
    movedIn: tenantMovedIn,
    amountDue: currentRemainingDue
  };

  const cal = buildPaymentCalendar({
    tenants: [tenantRecord],
    payments: cachedPayments,
    year: tenantCalYear,
    month: tenantCalMonth
  });

  monthLabelEl.textContent = cal.monthLabel;

  const chipClass = (status) => {
    if (status === 'Paid') return 'cal-chip-paid';
    if (status === 'Overdue' || status === 'Failed') return 'cal-chip-overdue';
    if (status === 'Scheduled') return 'cal-chip-scheduled';
    return 'cal-chip-pending';
  };

  gridEl.innerHTML = cal.days
    .map((cell) => {
      const classes = ['cal-cell'];
      if (!cell.inCurrentMonth) classes.push('outside');
      if (cell.isToday) classes.push('today');
      if (cell.dateKey === tenantSelectedDateKey) classes.push('selected');

      const dueChips = cell.dueEvents
        .map((ev) => {
          if (ev.isMoveInMarker) {
            return `<div class="cal-chip" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;" title="Scheduled Move-in Date: ${escapeHtml(ev.dueDate)}">🔑 Move-In Day</div>`;
          }
          const label =
            ev.status === 'Paid'
              ? `✓ Paid ₱${ev.amount.toLocaleString()}`
              : ev.status === 'Overdue'
                ? `! Overdue ₱${ev.remaining.toLocaleString()}`
                : ev.status === 'Scheduled'
                  ? `Future ₱${ev.amount.toLocaleString()}`
                  : `Due ₱${ev.remaining.toLocaleString()}`;
          return `<div class="cal-chip ${chipClass(ev.status)}" title="${escapeHtml(ev.dueDate)}">${escapeHtml(label)}</div>`;
        })
        .join('');

      const payChips = cell.paymentEvents
        .map((p) => {
          const pLabel = `${p.status === 'Paid' ? '✓' : p.status === 'Failed' ? '✕' : '⏱'} ₱${p.amount.toLocaleString()}`;
          return `<div class="cal-chip ${chipClass(p.status)}" title="${escapeHtml(p.purpose)}">${escapeHtml(pLabel)}</div>`;
        })
        .join('');

      return `
        <div class="${classes.join(' ')}" data-action="tenant-cal-select-day" data-date-key="${escapeHtml(cell.dateKey)}">
          <div class="cal-day-num">${cell.dayNumber}</div>
          ${dueChips}
          ${payChips}
        </div>`;
    })
    .join('');

  if (detailEl) {
    const selectedCell = cal.days.find((d) => d.dateKey === tenantSelectedDateKey);
    if (selectedCell && (selectedCell.dueEvents.length || selectedCell.paymentEvents.length)) {
      const items = [
        ...selectedCell.dueEvents.map(
          (ev) =>
            `<div><strong>Rent Due (${escapeHtml(ev.status)}):</strong> ₱${ev.amount.toLocaleString()} (${escapeHtml(ev.room)}) — Remaining: ₱${ev.remaining.toLocaleString()}</div>`
        ),
        ...selectedCell.paymentEvents.map(
          (p) =>
            `<div><strong>Payment (${escapeHtml(p.status)}):</strong> ₱${p.amount.toLocaleString()} • ${escapeHtml(p.purpose)} (${escapeHtml(p.referenceNumber || p.method)})</div>`
        )
      ].join('');
      detailEl.style.display = 'block';
      detailEl.innerHTML = `<div style="font-weight:700;margin-bottom:4px;">Details for ${escapeHtml(selectedCell.dateKey)}</div>${items}`;
    } else {
      detailEl.style.display = 'none';
      detailEl.innerHTML = '';
    }
  }

  if (upcomingEl) {
    if (!cal.upcomingSchedule.length) {
      upcomingEl.innerHTML =
        '<div style="color:#64748b;font-size:12px;">All scheduled dues settled.</div>';
    } else {
      upcomingEl.innerHTML = cal.upcomingSchedule
        .map(
          (item) => `
          <div class="cal-upcoming-item">
            <div>
              <div style="font-weight:700;color:#0f172a;">${escapeHtml(item.dueDate)}</div>
              <div style="color:#64748b;font-size:11px;">₱${item.amount.toLocaleString()} • ${escapeHtml(item.room)}</div>
            </div>
            <span class="cal-chip ${chipClass(item.status === 'Due Soon' ? 'Pending' : item.status)}">${escapeHtml(item.status)}</span>
          </div>`
        )
        .join('');
    }
  }
}

// Apply immediately from session storage
populateTenantUI();

// Also fetch the current tenant profile from Supabase.
async function fetchTenantSupabaseProfile() {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    const meta = user.user_metadata || {};
    const tenantsRef = supabaseData.collection(supabase, 'tenants');
    const q = supabaseData.query(tenantsRef, supabaseData.where('uid', '==', user.id));

    supabaseData.onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const tenantDoc = snapshot.docs[0];
          currentTenantDocId = tenantDoc.id;
          sessionStorage.setItem('tenantDocId', currentTenantDocId);
          const docData = tenantDoc.data();
          const useMetaOverride =
            meta.profileUpdatedAt &&
            (!docData.updatedAt || String(meta.profileUpdatedAt) >= String(docData.updatedAt));
          const resolvedName = (useMetaOverride && meta.name) || docData.name;
          const resolvedPhone = (useMetaOverride && meta.phone) || docData.phone;
          const resolvedEmergency =
            (useMetaOverride && meta.emergencyContact) || docData.emergencyContact;
          if (resolvedName) {
            tenantName = resolvedName;
            sessionStorage.setItem('tenantName', resolvedName);
          }
          if (resolvedPhone) {
            tenantPhone = resolvedPhone;
            sessionStorage.setItem('tenantPhone', resolvedPhone);
          }
          if (docData.room) {
            tenantRoom = docData.room;
            sessionStorage.setItem('tenantRoom', docData.room);
          }
          if (docData.dormName) {
            tenantDorm = docData.dormName;
            sessionStorage.setItem('tenantDorm', docData.dormName);
          }
          if (docData.moveInDate) {
            tenantMoveIn = docData.moveInDate;
            sessionStorage.setItem('tenantMoveInDate', docData.moveInDate);
          }
          if (docData.dueDay) {
            tenantDueDay = parseInt(docData.dueDay);
            sessionStorage.setItem('tenantDueDay', tenantDueDay);
          }
          if (docData.movedIn !== undefined) {
            tenantMovedIn = Boolean(docData.movedIn);
            sessionStorage.setItem('tenantMovedIn', tenantMovedIn ? 'true' : 'false');
          }
          if (docData.monthlyRent) {
            tenantRent = parseFloat(docData.monthlyRent);
            sessionStorage.setItem('tenantMonthlyRent', tenantRent);
          }
          if (docData.amountDue !== undefined && docData.amountDue !== null) {
            currentRemainingDue = parseFloat(docData.amountDue);
            tenantExplicitAmountDueSet = true;
            sessionStorage.setItem('tenantAmountDue', currentRemainingDue);
            localStorage.setItem('tenant_amount_due_' + userEmail, currentRemainingDue);
          }
          if (resolvedEmergency) {
            tenantEmergency = resolvedEmergency;
            sessionStorage.setItem('tenantEmergencyContact', resolvedEmergency);
          }
          populateTenantUI();
        }
      },
      (error) => console.error('Tenant profile subscription failed:', error)
    );
  } catch (err) {
    console.warn('Could not sync tenant profile from Supabase:', err);
  }
}

fetchTenantSupabaseProfile();

function switchTab(tabName, evt) {
  try {
    sessionStorage.setItem('tenant_portal_active_tab', tabName);
  } catch { }
  const tabs = document.querySelectorAll('.tab-content');
  tabs.forEach((tab) => tab.classList.remove('active'));
  const tabButtons = document.querySelectorAll('.tab');
  tabButtons.forEach((btn) => btn.classList.remove('active'));
  const targetContent = document.getElementById(tabName + '-tab');
  if (targetContent) targetContent.classList.add('active');
  // The caller passes the triggering element. `window.event` is a legacy
  // global and is not reliable from module code.
  const target = evt?.target?.closest?.('[data-tab-target]') ?? evt?.target ?? evt;
  if (target && target.classList && target.classList.contains('tab')) {
    target.classList.add('active');
  } else {
    tabButtons.forEach((btn) => {
      if (btn.dataset.tabTarget === tabName || btn.textContent.toLowerCase().includes(tabName)) {
        btn.classList.add('active');
      }
    });
  }
  if (tabName === 'messages') {
    setTimeout(() => {
      const chatMessages = document.getElementById('chatMessages');
      if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 100);
  }
  if (tabName === 'payment') {
    loadTenantPaymentHistory();
  }
  if (tabName === 'building-3d') {
    setTimeout(() => {
      ensureTenantBuilding3DInitialized();
    }, 40);
  }
}

function hasPendingPaymentReturn() {
  const href = window.location.href || '';
  if (/[?&](payment|payment_intent_id|sessionId)=/.test(href)) {
    return true;
  }
  try {
    if (
      sessionStorage.getItem('pending_paymongo_payment') ||
      localStorage.getItem('pending_paymongo_payment') ||
      sessionStorage.getItem('paymongo_checkout_active') === '1'
    ) {
      return true;
    }
  } catch { }
  return false;
}

// Synchronously activate the payment tab (or last active tab) before authPending
// reveals the page, so returning from PayMongo never flashes the Messages tab first.
(function syncInitialTabBeforeReveal() {
  const initialTab = hasPendingPaymentReturn()
    ? 'payment'
    : sessionStorage.getItem('tenant_portal_active_tab');
  if (initialTab && initialTab !== 'messages') {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach((tab) => tab.classList.remove('active'));
    const tabButtons = document.querySelectorAll('.tab');
    tabButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tabTarget === initialTab);
    });
    document.getElementById(`${initialTab}-tab`)?.classList.add('active');
  }
})();

async function logout() {
  await logoutStaff('./login.html');
}

function attachTenantPhoneFilter() {
  for (const id of ['phone', 'emergencyContact']) {
    const input = document.getElementById(id);
    if (!input || input.dataset.phoneGuard === '1') continue;
    input.dataset.phoneGuard = '1';
    input.addEventListener('input', () => {
      const cleaned = input.value.replace(/[^0-9+\s()-]/g, '');
      if (cleaned !== input.value) input.value = cleaned;
    });
  }
}

attachTenantPhoneFilter();

async function saveProfile() {
  const saveBtn = document.querySelector('[data-action="save-profile"]');
  const nameInput = document.getElementById('fullName');
  const phoneInput = document.getElementById('phone');
  const emergencyInput = document.getElementById('emergencyContact');

  const newName = (nameInput?.value || '').trim();
  const rawPhone = (phoneInput?.value || '').trim();
  const rawEmergency = (emergencyInput?.value || '').trim();

  if (!newName) {
    Toast.alert({ title: 'Missing Name', message: 'Please enter your full name.' });
    return;
  }

  if (!rawPhone || !isValidPhilippinePhone(rawPhone)) {
    Toast.alert({
      title: 'Invalid Phone Number',
      message: 'Please enter a valid 11-digit Philippine mobile number (e.g. 0912 345 6789).'
    });
    return;
  }

  if (rawEmergency && !isValidPhilippinePhone(rawEmergency)) {
    Toast.alert({
      title: 'Invalid Emergency Contact',
      message:
        'Please enter a valid 11-digit Philippine mobile number for your emergency contact (e.g. 0923 456 7890).'
    });
    return;
  }

  const newPhone = normalizePhilippinePhone(rawPhone) || rawPhone;
  const newEmergency = rawEmergency
    ? normalizePhilippinePhone(rawEmergency) || rawEmergency
    : '';

  const originalText = saveBtn ? saveBtn.textContent : 'Save Changes';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  try {
    const nowIso = supabaseData.serverTimestamp();

    // 1. Update verified Supabase Auth user metadata (always permitted for own session)
    const { error: authUpdateErr } = await supabase.auth.updateUser({
      data: {
        name: newName,
        phone: newPhone,
        emergencyContact: newEmergency,
        profileUpdatedAt: nowIso
      }
    });
    if (authUpdateErr) {
      console.warn('Auth metadata update warning:', authUpdateErr);
    }

    // 2. Update relational profiles row if present (permitted by "users can update own profile")
    try {
      const user = await getCurrentUser();
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ name: newName, phone: newPhone, updated_at: nowIso })
          .eq('id', user.id);
      }
    } catch {
      // Non-fatal if profiles row does not exist
    }

    // 3. Update tenants document in app_documents
    if (currentTenantDocId) {
      try {
        const ref = supabaseData.doc(supabase, 'tenants', currentTenantDocId);
        await supabaseData.updateDoc(ref, {
          name: newName,
          phone: newPhone,
          emergencyContact: newEmergency,
          updatedAt: nowIso
        });
      } catch (docErr) {
        console.warn('Tenant document update fallback (persisted via Auth metadata):', docErr);
      }
    }

    tenantName = newName;
    tenantPhone = newPhone;
    tenantEmergency = newEmergency;
    sessionStorage.setItem('tenantName', newName);
    sessionStorage.setItem('tenantPhone', newPhone);
    sessionStorage.setItem('tenantEmergencyContact', newEmergency);
    populateTenantUI();
    Toast.alert({
      title: 'Profile Updated',
      message: 'Your personal and contact information has been saved.'
    });
  } catch (err) {
    console.error('Failed to update tenant profile:', err);
    Toast.alert({
      title: 'Unable to Save Changes',
      message: 'We could not save your profile changes right now. Please check your connection and try again.'
    });
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }
}

// Update Submit Button State and Text
function updateSubmitButton() {
  const submitBtn = document.getElementById('submitPaymentBtn');
  if (!submitBtn) return;
  const amountRaw = (document.getElementById('paymentAmount')?.value || '0')
    .toString()
    .replace(/,/g, '');
  const amountNum = parseFloat(amountRaw) || 0;
  if (amountNum > 0) {
    submitBtn.innerHTML = `
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
            <span>Proceed to Pay (₱${amountNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
        `;
  } else {
    submitBtn.innerHTML = `
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
            <span>Proceed to Pay</span>
        `;
  }
  submitBtn.disabled = false;
}

document.getElementById('paymentAmount')?.addEventListener('input', updateSubmitButton);

// Payment Form Submission - Direct to PayMongo Hosted Checkout
document.getElementById('paymentForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const purpose = document.getElementById('paymentPurpose').value;
  const amountRaw = (document.getElementById('paymentAmount').value || '0')
    .toString()
    .replace(/,/g, '');
  const amountVal = parseFloat(amountRaw);
  const notes = (document.getElementById('paymentNotes').value || '').trim();
  const tenantName =
    document.getElementById('fullName')?.value ||
    sessionStorage.getItem('tenantName') ||
    'Juan Dela Cruz';
  const rawPhoneVal = document.getElementById('phone')?.value || '';
  const tenantPhone = isValidPhilippinePhone(rawPhoneVal)
    ? normalizePhilippinePhone(rawPhoneVal)
    : '';

  if (!amountVal || amountVal <= 0) {
    if (currentRemainingDue <= 0) {
      Toast.alert({
        title: 'Rent Settled',
        message:
          'Your rent for this cycle is already settled! If you wish to make an advance payment, please enter the advance amount in the payment amount box.'
      });
    } else {
      Toast.alert({ title: 'Invalid Amount', message: 'Please enter a valid payment amount.' });
    }
    return;
  }

  const submitBtn = document.getElementById('submitPaymentBtn');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
        <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="animation: spin 1s linear infinite;">
            <circle cx="12" cy="12" r="10" stroke-width="4" stroke="currentColor" stroke-opacity="0.25"></circle>
            <path d="M4 12a8 8 0 018-8" stroke-width="4" stroke-linecap="round"></path>
        </svg>
        <span>Connecting to PayMongo...</span>
    `;

  try {
    const descWithNotes = notes
      ? `${purpose} (${notes}) - MJP Residences`
      : `${purpose} - MJP Residences`;
    const successUrl = `${window.location.origin}${window.location.pathname}?payment=success&amount=${amountVal}&purpose=${encodeURIComponent(purpose)}`;
    const cancelUrl = `${window.location.origin}${window.location.pathname}?payment=failed&amount=${amountVal}&purpose=${encodeURIComponent(purpose)}`;

    const session = await PayMongo.createCheckoutSession({
      amount: amountVal,
      purpose: purpose,
      notes: notes,
      description: descWithNotes,
      tenantName: tenantName,
      tenantEmail: userEmail,
      tenantPhone: tenantPhone,
      paymentMethodTypes: ['card', 'paymaya', 'grab_pay', 'gcash', 'qrph'],
      successUrl: successUrl,
      cancelUrl: cancelUrl
    });

    if (session && session.checkoutUrl) {
      const pendingPayload = JSON.stringify({
        sessionId: session.sessionId,
        referenceNumber: session.referenceNumber,
        amount: amountVal,
        purpose: purpose,
        notes: notes,
        method: 'PayMongo Checkout',
        tenantName: tenantName,
        tenantEmail: userEmail
      });
      sessionStorage.setItem('pending_paymongo_payment', pendingPayload);
      localStorage.setItem('pending_paymongo_payment', pendingPayload);
      sessionStorage.setItem('paymongo_checkout_active', '1');
      sessionStorage.setItem('tenant_portal_active_tab', 'payment');

      window.location.href = session.checkoutUrl;
      return;
    } else {
      throw new Error('Unable to generate PayMongo checkout session.');
    }
  } catch (err) {
    console.error('Payment processing failed:', err);
    Toast.alert({
      title: 'Payment Processing Error',
      message: err.message || 'Unable to start payment.'
    });
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
});

// Initiate QR Ph flow with PayMongo.
//
// UNREACHABLE: nothing calls this, and it is the only thing that opens the QR
// modal -- so showQrModal/confirmQrPayment and the "I Have Completed Payment"
// button below are dead too. Left in place pending a decision: wire the QR
// method up, or delete the whole flow. See CONVERSION-SUMMARY.md.
// eslint-disable-next-line no-unused-vars
async function initiateQrPhFlow(amountVal, purpose, tenantName, tenantPhone) {
  // Always set activeQrPaymentData first so "I Have Completed Payment" always works
  const refNumber = 'PM-QR-' + Date.now().toString().slice(-6);
  activeQrPaymentData = {
    referenceNumber: refNumber,
    sessionId: '',
    checkoutUrl: '',
    paymentMethodId: 'pm_qr_' + Date.now().toString(36),
    method: 'QR Ph (GCash/Maya)',
    amount: amountVal,
    purpose: purpose,
    tenantName: tenantName,
    tenantEmail: userEmail,
    dateFormatted: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
    status: 'Pending'
  };

  // The QR modal is only available when PayMongo creates a real session.
  try {
    const session = await PayMongo.createCheckoutSession({
      amount: amountVal,
      description: `${purpose} - MJP Residences (QR Ph)`,
      tenantName: tenantName,
      tenantEmail: userEmail,
      tenantPhone: tenantPhone,
      paymentMethodTypes: ['qrph'],
      successUrl: `${window.location.origin}${window.location.pathname}?payment=success&method=qrph&amount=${amountVal}&purpose=${encodeURIComponent(purpose)}`,
      cancelUrl: `${window.location.origin}${window.location.pathname}?payment=cancelled`
    });
    if (session && session.sessionId) {
      activeQrPaymentData.sessionId = session.sessionId;
      activeQrPaymentData.referenceNumber =
        session.referenceNumber || activeQrPaymentData.referenceNumber;
      activeQrPaymentData.paymentMethodId = session.sessionId;
    }
  } catch (e) {
    console.warn('PayMongo QR session (non-critical):', e.message);
  }

  showQrModal(activeQrPaymentData);
}

// Show PayMongo QR Ph Modal
function showQrModal(data) {
  document.getElementById('qrModalAmount').textContent =
    `₱${data.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  document.getElementById('qrModalRef').textContent = data.referenceNumber;

  // Always generate a proper QR Ph code using payment reference data
  const qrContent = PayMongo
    ? PayMongo.generateQrPhImageUrl({
      amount: data.amount,
      reference: data.referenceNumber,
      merchant: 'MJP Residences'
    })
    : `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=10&data=${encodeURIComponent('PAYMONGO-QRPH-' + data.referenceNumber + '-' + data.amount)}`;
  document.getElementById('qrModalImage').src = qrContent;

  // Start 15 minute countdown timer
  let timeLeft = 15 * 60;
  const timerEl = document.getElementById('qrTimer');
  if (qrTimerInterval) clearInterval(qrTimerInterval);
  qrTimerInterval = setInterval(() => {
    timeLeft--;
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    if (timeLeft <= 0) {
      clearInterval(qrTimerInterval);
      closeQrModal();
      Toast.alert({
        title: 'Session Expired',
        message: 'Payment session expired. Please generate a new QR code.'
      });
    }
  }, 1000);

  // Auto-poll PayMongo session status every 3 seconds to detect when paid in test mode
  if (qrStatusPollInterval) clearInterval(qrStatusPollInterval);
  if (data.sessionId && PayMongo?.getCheckoutSession) {
    qrStatusPollInterval = setInterval(async () => {
      try {
        const session = await PayMongo.getCheckoutSession(data.sessionId);
        if (session) {
          const payments = session.attributes?.payments || [];
          const isPaid = session.attributes?.status === 'paid';
          if (isPaid) {
            clearInterval(qrStatusPollInterval);
            closeQrModal();
            if (payments.length > 0 && payments[0].id) {
              activeQrPaymentData.paymentMethodId = payments[0].id;
            }
            await saveAndFinalizePayment(activeQrPaymentData);
            activeQrPaymentData = null;
          }
        }
      } catch (err) {
        // ignore poll errors
      }
    }, 3000);
  }

  document.getElementById('paymongoQrModal').style.display = 'flex';
}

function closeQrModal() {
  if (qrTimerInterval) clearInterval(qrTimerInterval);
  if (qrStatusPollInterval) clearInterval(qrStatusPollInterval);
  document.getElementById('paymongoQrModal').style.display = 'none';
}

// Confirm QR Payment only after PayMongo reports the session as paid.
async function confirmQrPayment() {
  if (!activeQrPaymentData) return;

  const confirmBtn = document.getElementById('confirmQrBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = 'Verifying with PayMongo...';
  }

  try {
    if (!activeQrPaymentData.sessionId) {
      throw new Error('No PayMongo checkout session was created.');
    }
    const session = await PayMongo.getCheckoutSession(activeQrPaymentData.sessionId);
    if (session?.attributes?.status !== 'paid') {
      throw new Error('PayMongo has not confirmed this payment yet. Please try again shortly.');
    }
    const payments = session.attributes?.payments || [];
    if (payments[0]?.id) activeQrPaymentData.paymentMethodId = payments[0].id;
    activeQrPaymentData.status = 'Paid';
    closeQrModal();
    await saveAndFinalizePayment({ ...activeQrPaymentData });
    activeQrPaymentData = null;
  } catch (error) {
    Toast.alert({
      title: 'Verification Pending',
      message: error.message || 'Unable to verify payment status.'
    });
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = 'I Have Completed Payment';
    }
  }
}

// The PayMongo webhook owns payment records; the browser immediately renders and syncs.
async function saveAndFinalizePayment(record) {
  if (record?.status !== 'Paid') throw new Error('Payment has not been verified by PayMongo.');

  // Deduct remaining rent due immediately and persist so UI reflects payment instantly
  const paidAmount = parseFloat(record.amount) || 0;
  currentRemainingDue = Math.max(0, currentRemainingDue - paidAmount);
  sessionStorage.setItem('tenantAmountDue', currentRemainingDue);
  if (userEmail) {
    localStorage.setItem('tenant_amount_due_' + userEmail, currentRemainingDue);
  }
  updateAmountDueUI();

  const cleanPurpose = (record.purpose || 'Monthly Rent').replace(/\s*-\s*MJP Residences\s*$/i, '').trim();
  record.purpose = cleanPurpose;
  const canonicalDocId = record.paymentMethodId || record.referenceNumber;
  if (!record.referenceNumber || record.referenceNumber.startsWith('PM-RET-')) {
    record.referenceNumber = `PM-${canonicalDocId.slice(-6).toUpperCase()}`;
  }

  // Render immediately in table if not already cached
  const alreadyInCache = cachedPayments.some((p) => {
    if (p.referenceNumber && p.referenceNumber === record.referenceNumber) return true;
    if (p.paymentMethodId && record.paymentMethodId && p.paymentMethodId === record.paymentMethodId) return true;
    if (Number(p.amount) === Number(record.amount) && (p.purpose || '').replace(/\s*-\s*MJP Residences\s*$/i, '').trim().toLowerCase() === cleanPurpose.toLowerCase()) return true;
    return false;
  });

  if (!alreadyInCache) {
    cachedPayments.unshift(record);
    renderPaymentHistoryTable(cachedPayments);
  }

  // Attempt direct persistence to Supabase payments table AND app_documents
  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (session) {
      await supabase.from('payments').upsert({
        id: record.referenceNumber,
        session_id: canonicalDocId,
        tenant_name: record.tenantName,
        tenant_email: record.tenantEmail,
        tenant_uid: session.user.id,
        amount: record.amount,
        status: 'Paid',
        payment_method: record.method,
        purpose: record.purpose,
        notes: record.notes,
        reference_number: record.referenceNumber,
        created_at: record.createdAt || new Date().toISOString()
      });

      await supabase.from('app_documents').upsert({
        collection: 'payments',
        id: canonicalDocId,
        data: {
          ...record,
          tenantUid: session.user.id
        }
      });
    }
  } catch (err) {
    console.warn('Direct payment persistence sync to Supabase:', err);
  }

  // Reload history in background
  try {
    await loadTenantPaymentHistory();
  } catch (e) { }

  updateAmountDueUI();
  showReceiptModal(record);
}

// Failed payment state is recorded by the provider webhook, not the browser.
async function saveFailedPayment(record) {
  await loadTenantPaymentHistory();
  showReceiptModal(record);
}

function formatPaymentDateTime(record) {
  const raw = record?.dateFormatted || record?.createdAt || record?.created_at || record?.timestamp;
  if (!raw) {
    return new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
  const dateObj = new Date(raw);
  if (isNaN(dateObj.getTime())) {
    return String(raw);
  }
  return dateObj.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatPaymentDate(record) {
  const raw = record?.created_at || record?.createdAt || record?.timestamp || record?.dateFormatted;
  if (!raw) return '—';
  const dateObj = new Date(raw);
  if (isNaN(dateObj.getTime())) {
    return String(raw);
  }
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Show Official Receipt Modal (Supports Paid & Failed states)
function showReceiptModal(record) {
  const isFailed =
    (record.status || '').toLowerCase().includes('fail') ||
    (record.status || '').toLowerCase().includes('declined') ||
    (record.status || '').toLowerCase().includes('cancel');

  const headerEl = document.getElementById('receiptModalHeader');
  const dotEl = document.getElementById('receiptModalDot');
  const headerTitleEl = document.getElementById('receiptModalHeaderTitle');
  const iconContainer = document.getElementById('receiptIconContainer');
  const titleEl = document.getElementById('receiptModalTitle');
  const subtitleEl = document.getElementById('receiptModalSubtitle');
  const statusBadgeEl = document.getElementById('receiptStatusBadge');
  const failureRow = document.getElementById('receiptFailureRow');
  const failureReasonEl = document.getElementById('receiptFailureReason');
  const amountLabelEl = document.getElementById('receiptAmountLabel');
  const amountEl = document.getElementById('receiptAmount');
  const printBtn = document.getElementById('receiptPrintBtn');
  const closeBtn = document.getElementById('receiptCloseBtn');

  document.getElementById('receiptTenantName').textContent = record.tenantName || 'Juan Dela Cruz';
  const residenceEl = document.getElementById('receiptResidence');
  if (residenceEl)
    residenceEl.textContent = `${tenantDorm || 'Triple Occupancy Room'} (${tenantRoom || 'Room 201'})`;
  document.getElementById('receiptPurpose').textContent = record.purpose || 'Monthly Rent';
  document.getElementById('receiptMethod').textContent = record.method || 'PayMongo Checkout';
  document.getElementById('receiptReference').textContent = record.referenceNumber || 'PM-REF';
  document.getElementById('receiptTokenId').textContent = record.paymentMethodId || 'pm_verified';
  document.getElementById('receiptDateTime').textContent = formatPaymentDateTime(record);

  const formattedAmount = `₱${parseFloat(record.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  if (isFailed) {
    // Failed Payment Styling
    if (headerEl) headerEl.style.background = '#fef2f2';
    if (dotEl) {
      dotEl.style.background = '#ef4444';
      dotEl.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.2)';
    }
    if (headerTitleEl) {
      headerTitleEl.textContent = 'PayMongo Payment Notice - Failed';
      headerTitleEl.style.color = '#991b1b';
    }
    if (iconContainer) {
      iconContainer.innerHTML = '<div class="receipt-fail-icon">✕</div>';
    }
    if (titleEl) {
      titleEl.textContent = 'Payment Failed';
      titleEl.style.color = '#dc2626';
    }
    if (subtitleEl) {
      subtitleEl.textContent =
        'Transaction was not completed or 3DS authentication failed on PayMongo.';
    }
    if (statusBadgeEl) {
      statusBadgeEl.innerHTML = '<span class="status-badge-failed">✗ Failed</span>';
    }
    if (failureRow) {
      failureRow.style.display = 'flex';
      if (failureReasonEl) {
        failureReasonEl.textContent =
          record.failureReason || 'Card authentication failed / cancelled in PayMongo test mode';
      }
    }
    if (amountLabelEl) amountLabelEl.textContent = 'Amount (Unpaid)';
    if (amountEl) {
      amountEl.textContent = `${formattedAmount} (Not Charged)`;
      amountEl.style.color = '#dc2626';
    }
    if (printBtn) {
      printBtn.style.borderColor = '#ef4444';
      printBtn.style.color = '#dc2626';
      printBtn.innerHTML = `
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z">
                    </path>
                </svg>
                <span>Print Failure Notice</span>
            `;
    }
    if (closeBtn) {
      closeBtn.style.background = '#dc2626';
      closeBtn.textContent = 'Try Again';
    }
  } else {
    // Successful Payment Styling
    if (headerEl) headerEl.style.background = '#f0fdf4';
    if (dotEl) {
      dotEl.style.background = '#10B981';
      dotEl.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';
    }
    if (headerTitleEl) {
      headerTitleEl.textContent = 'PayMongo Payment Receipt';
      headerTitleEl.style.color = '#166534';
    }
    if (iconContainer) {
      iconContainer.innerHTML = '<div class="receipt-check-icon">✓</div>';
    }
    if (titleEl) {
      titleEl.textContent = 'Payment Successful';
      titleEl.style.color = '#0f172a';
    }
    if (subtitleEl) {
      subtitleEl.textContent = 'Your transaction has been processed and verified by PayMongo.';
    }
    if (statusBadgeEl) {
      statusBadgeEl.innerHTML = '<span class="status-badge-paid">✓ Paid</span>';
    }
    if (failureRow) failureRow.style.display = 'none';
    if (amountLabelEl) amountLabelEl.textContent = 'Amount Paid';
    if (amountEl) {
      amountEl.textContent = formattedAmount;
      amountEl.style.color = '#059669';
    }
    if (printBtn) {
      printBtn.style.borderColor = '#10B981';
      printBtn.style.color = '#10B981';
      printBtn.innerHTML = `
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z">
                    </path>
                </svg>
                <span>Print / Save Receipt</span>
            `;
    }
    if (closeBtn) {
      closeBtn.style.background = '#10B981';
      closeBtn.textContent = 'Done';
    }
  }

  document.getElementById('paymongoReceiptModal').style.display = 'flex';
}

function closeReceiptModal() {
  document.getElementById('paymongoReceiptModal').style.display = 'none';
}

// Print Receipt
function printReceipt() {
  const printContent = document.getElementById('receiptPrintArea').innerHTML;
  const printWindow = window.open('', '_blank', 'width=600,height=700');
  printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Official Payment Receipt - MJP Residences</title>
            <!-- The print window is about:blank, so it cannot resolve a
                 relative stylesheet path. Print styles live here. -->
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; }
                .receipt-details-list { border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
                .receipt-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
                .receipt-row:last-child { border-bottom: none; font-weight: bold; font-size: 16px; color: #0f172a; }
                .receipt-check-icon { font-size: 40px; color: #16a34a; text-align: center; margin-bottom: 10px; }
                .receipt-fail-icon { font-size: 40px; color: #dc2626; text-align: center; margin-bottom: 10px; }
                .paymongo-tag { background: #10B981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; }
                .status-badge-paid { background: #dcfce7; color: #15803d; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
                .status-badge-failed { background: #fee2e2; color: #b91c1c; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
                .no-print { display: none !important; }
            </style>
        </head>
        <body>
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="margin: 0 0 4px;">MJP Residences</h2>
                <p style="margin: 0; color: #64748b; font-size: 13px;">Official Electronic Payment Record • Powered by PayMongo</p>
            </div>
            ${printContent}
            <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #94a3b8;">
                This document serves as your verified proof of transaction. For inquiries, contact management.
            </div>
        </body>
        </html>
    `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
}

// Load Tenant Payment History
async function loadTenantPaymentHistory() {
  const tableBody = document.getElementById('paymentHistoryTableBody');
  const countBadge = document.getElementById('historyCountBadge');
  if (!tableBody) return;

  let payments = [];
  if (PayMongo) {
    try {
      payments = await PayMongo.getTenantPayments();
      cachedPayments = payments || [];
    } catch (error) {
      console.error('Failed to load payment history:', error);
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: #b91c1c; padding: 24px;">
            Unable to load payment history. Please refresh and try again.
          </td>
        </tr>
      `;
      if (countBadge) countBadge.textContent = 'Unavailable';
      return;
    }
  }

  // If tenant document did not have an explicit amountDue set in Supabase,
  // calculate remaining amount due from existing payment records
  if (!tenantExplicitAmountDueSet && payments && payments.length > 0) {
    const totalPaid = payments
      .filter((p) => p.status === 'Paid')
      .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    if (totalPaid >= tenantRent) {
      currentRemainingDue = 0;
    } else if (totalPaid > 0) {
      currentRemainingDue = Math.max(0, tenantRent - totalPaid);
    }
    sessionStorage.setItem('tenantAmountDue', currentRemainingDue);
    localStorage.setItem('tenant_amount_due_' + userEmail, currentRemainingDue);
    updateAmountDueUI();
  } else {
    updateAmountDueUI();
  }

  renderPaymentHistoryTable(payments);
  renderTenantPaymentCalendar();
}

// Render payment history rows
function renderPaymentHistoryTable(payments) {
  const tableBody = document.getElementById('paymentHistoryTableBody');
  const countBadge = document.getElementById('historyCountBadge');
  if (!tableBody) return;

  if (!payments || payments.length === 0) {
    tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: #9ca3af; padding: 24px;">
                    No payment records found. Make your first payment above!
                </td>
            </tr>
        `;
    if (countBadge) countBadge.textContent = '0 payments';
    return;
  }

  if (countBadge)
    countBadge.textContent = `${payments.length} payment${payments.length > 1 ? 's' : ''}`;

  tableBody.innerHTML = payments
    .map((p, idx) => {
      const isFailed =
        (p.status || '').toLowerCase().includes('fail') ||
        (p.status || '').toLowerCase().includes('declined') ||
        (p.status || '').toLowerCase().includes('cancel');
      const isPending = (p.status || '').toLowerCase() === 'pending';
      const statusBadge = isFailed
        ? `<span class="status-badge-failed">✗ Failed</span>`
        : isPending
          ? `<span class="status-badge-pending">⏱ Pending</span>`
          : `<span class="status-badge-paid">✓ Paid</span>`;
      const amountColor = isFailed ? '#dc2626' : isPending ? '#b45309' : '#059669';

      return `
        <tr>
            <td>${formatPaymentDate(p)}</td>
            <td style="font-family: monospace; font-size: 12px; color: #475569;">${p.referenceNumber || 'PM-' + idx}</td>
            <td>${p.purpose || 'Monthly Rent'}</td>
            <td>${p.method || 'PayMongo'}</td>
            <td style="font-weight: 600; color: ${amountColor};">₱${parseFloat(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-view-receipt" data-action="view-receipt" data-index="${idx}">
                    Receipt
                </button>
            </td>
        </tr>
        `;
    })
    .join('');
}

// Check for return from PayMongo (Direct 3DS Card Intent OR Hosted Checkout Session)
async function checkUrlPaymentReturn() {
  const urlParams = new URLSearchParams(window.location.search);
  let paymentIntentId = urlParams.get('payment_intent_id');
  if (!paymentIntentId) {
    const match = window.location.href.match(/[?&]payment_intent_id=([^&#]+)/);
    if (match) {
      paymentIntentId = decodeURIComponent(match[1]);
    }
  }

  let paymentStatus = urlParams.get('payment');
  if (!paymentStatus) {
    const matchStatus = window.location.href.match(/[?&]payment=([^&#]+)/);
    if (matchStatus) {
      paymentStatus = decodeURIComponent(matchStatus[1]);
    }
  }

  // Read pending payment from BOTH storages (localStorage survives more edge cases)
  let pending = null;
  try {
    const saved =
      sessionStorage.getItem('pending_paymongo_payment') ||
      localStorage.getItem('pending_paymongo_payment');
    if (saved) pending = JSON.parse(saved);
  } catch (e) { }

  console.log(
    '[PayReturn] URL params - paymentIntentId:',
    paymentIntentId,
    '| paymentStatus:',
    paymentStatus,
    '| pending:',
    pending
  );

  // If neither param found in URL, but we have pending direct 3DS payment and we just returned to tenant portal
  if (!paymentIntentId && !paymentStatus && pending?.paymentIntentId) {
    paymentIntentId = pending.paymentIntentId;
  }

  // If any payment return indicator is present, switch to the payment tab immediately
  // BEFORE awaiting any PayMongo verification calls so the Messages tab never flashes first.
  if (paymentIntentId || paymentStatus || pending?.sessionId) {
    sessionStorage.removeItem('paymongo_checkout_active');
    switchTab('payment');
  }

  // SCENARIO: Returned from PayMongo hosted checkout with no URL params
  // This happens when card is declined or 3DS fails — PayMongo doesn't always redirect to cancel_url.
  // Detect via pending checkout sessionId and fetch the actual session status from PayMongo.
  if (!paymentIntentId && !paymentStatus && pending?.sessionId) {
    console.log('[PayReturn] Checking pending checkout session:', pending.sessionId);
    const sessionId = pending.sessionId;
    sessionStorage.removeItem('pending_paymongo_payment');
    localStorage.removeItem('pending_paymongo_payment');

    let sessionStatus = null;
    let checkedSession = null;
    let failureDetail = 'Card declined or 3DS authentication failed.';
    try {
      if (PayMongo?.getCheckoutSession) {
        checkedSession = await PayMongo.getCheckoutSession(sessionId);
        console.log('[PayReturn] Session data:', checkedSession);
        if (checkedSession) {
          sessionStatus = checkedSession.attributes?.status;
          const lastErr = checkedSession.attributes?.payment_intent?.attributes?.last_payment_error;
          if (lastErr && (lastErr.failed_message || lastErr.detail)) {
            failureDetail = lastErr.failed_message || lastErr.detail;
          }
        }
      }
    } catch (e) {
      console.warn('[PayReturn] Could not inspect checkout session:', e);
    }

    console.log('[PayReturn] Session status:', sessionStatus, '| failureDetail:', failureDetail);

    const hasPaidPayment =
      Array.isArray(checkedSession?.attributes?.payments) &&
      checkedSession.attributes.payments.some((p) => p?.attributes?.status === 'paid');
    const hasSucceededPI =
      checkedSession?.attributes?.payment_intent?.attributes?.status === 'succeeded';
    const isPaid = sessionStatus === 'paid' || hasPaidPayment || hasSucceededPI;

    if (isPaid) {
      const lineItemsSum =
        ((checkedSession?.attributes?.line_items || []).reduce(
          (sum, item) => sum + Number(item.amount || 0) * Number(item.quantity || 1),
          0
        ) || 0) / 100;
      const amountParam2 =
        Number.isFinite(lineItemsSum) && lineItemsSum > 0
          ? lineItemsSum
          : parseFloat(pending?.amount) || 5000;
      const purposeParam2 = pending?.purpose || 'Monthly Rent';
      const tenantNameVal2 =
        pending?.tenantName || sessionStorage.getItem('tenantName') || 'Tenant';
      const refNumber2 = pending?.referenceNumber || (sessionId ? `PM-${sessionId.slice(-6).toUpperCase()}` : 'PM-RET-' + Date.now().toString().slice(-6));
      const record2 = {
        referenceNumber: refNumber2,
        paymentMethodId: sessionId,
        method: pending?.method || 'PayMongo Checkout',
        amount: amountParam2,
        purpose: purposeParam2,
        notes: pending?.notes || 'Completed via PayMongo Checkout',
        tenantName: tenantNameVal2,
        tenantEmail: userEmail,
        dateFormatted: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        status: 'Paid'
      };
      window.history.replaceState({}, document.title, window.location.pathname);
      switchTab('payment');
      await saveAndFinalizePayment(record2);
    } else if (sessionStatus === 'expired') {
      const amountParam2 = parseFloat(pending?.amount) || 5000;
      const purposeParam2 = pending?.purpose || 'Monthly Rent';
      const tenantNameVal2 =
        pending?.tenantName || sessionStorage.getItem('tenantName') || 'Tenant';
      const refNumber2 = pending?.referenceNumber || 'PM-FAIL-' + Date.now().toString().slice(-6);
      const record2 = {
        referenceNumber: refNumber2,
        paymentMethodId: sessionId,
        method: pending?.method || 'Credit/Debit Card (PayMongo Checkout)',
        amount: amountParam2,
        purpose: purposeParam2,
        notes: pending?.notes || 'Card declined / 3DS authentication failed',
        failureReason: failureDetail,
        tenantName: tenantNameVal2,
        tenantEmail: userEmail,
        dateFormatted: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        status: 'Failed'
      };
      window.history.replaceState({}, document.title, window.location.pathname);
      switchTab('payment');
      // Save receipt first, then expire session in background (non-blocking)
      await saveFailedPayment(record2);
    } else {
      window.history.replaceState({}, document.title, window.location.pathname);
      switchTab('payment');
      Toast.alert({
        title: 'Payment Status Pending',
        message:
          'PayMongo has not confirmed a completed payment yet. Check your payment history shortly.'
      });
    }
    return;
  }

  // If neither parameter is present and no pending, nothing to do
  if (!paymentIntentId && !paymentStatus) return;

  sessionStorage.removeItem('pending_paymongo_payment');
  localStorage.removeItem('pending_paymongo_payment');

  const amountParam = parseFloat(urlParams.get('amount')) || pending?.amount || 5000;
  const purposeParam = urlParams.get('purpose') || pending?.purpose || 'Monthly Rent';
  const tenantNameVal =
    pending?.tenantName ||
    document.getElementById('fullName')?.value ||
    sessionStorage.getItem('tenantName') ||
    'Juan Dela Cruz';

  // SCENARIO 1: RETURN FROM DIRECT CARD 3DS TEST
  if (paymentIntentId) {
    let piData = null;
    try {
      piData = await PayMongo.getPaymentIntentStatus(paymentIntentId);
    } catch (err) {
      console.warn('Could not inspect payment intent:', err);
    }

    // Fails closed: only an explicit "succeeded" counts as paid.
    const { isSuccess, failureDetail } = interpretPaymentIntent(piData);

    const refNumber =
      pending?.referenceNumber || 'PM-CARD-' + paymentIntentId.slice(-6).toUpperCase();

    // Remove query parameters from URL without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
    switchTab('payment');

    if (isSuccess) {
      const record = {
        referenceNumber: refNumber,
        paymentMethodId: paymentIntentId,
        method: 'Credit/Debit Card (PayMongo Test 3DS)',
        amount: amountParam,
        purpose: purposeParam,
        notes: pending?.notes || 'Paid via PayMongo 3DS Card Payment',
        tenantName: tenantNameVal,
        tenantEmail: userEmail,
        dateFormatted: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        status: 'Paid'
      };
      await saveAndFinalizePayment(record);
    } else {
      const record = {
        referenceNumber: refNumber,
        paymentMethodId: paymentIntentId,
        method: 'Credit/Debit Card (PayMongo Test 3DS)',
        amount: amountParam,
        purpose: purposeParam,
        notes: pending?.notes || 'PayMongo 3DS Test Failed / Declined',
        failureReason: failureDetail,
        tenantName: tenantNameVal,
        tenantEmail: userEmail,
        dateFormatted: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        status: 'Failed'
      };
      await saveFailedPayment(record);
    }
    return;
  }

  // SCENARIO 2: RETURN FROM PAYMONGO HOSTED CHECKOUT (SUCCESS)
  if (paymentStatus === 'success') {
    const sessionId = pending?.sessionId || urlParams.get('sessionId');
    let session = null;
    if (sessionId && PayMongo?.getCheckoutSession) {
      try {
        session = await PayMongo.getCheckoutSession(sessionId);
      } catch (error) {
        console.warn('Could not verify checkout session from bridge, using return params:', error);
      }
    }

    // Customer was redirected by PayMongo to success_url after payment authorization.
    // Only abort if PayMongo explicitly confirms session has expired.
    if (session?.attributes?.status === 'expired') {
      window.history.replaceState({}, document.title, window.location.pathname);
      switchTab('payment');
      Toast.alert({
        title: 'Checkout Session Expired',
        message: 'PayMongo checkout session has expired. Please try your payment again.'
      });
      return;
    }

    const methodParam = urlParams.get('method') || pending?.method || 'PayMongo Checkout';
    const refNumber = pending?.referenceNumber || (sessionId ? `PM-${sessionId.slice(-6).toUpperCase()}` : 'PM-RET-' + Date.now().toString().slice(-6));
    const lineItemsAmount =
      (session?.attributes?.line_items || []).reduce(
        (sum, item) => sum + Number(item.amount || 0) * Number(item.quantity || 1),
        0
      ) / 100;
    const actualAmount =
      Number.isFinite(lineItemsAmount) && lineItemsAmount > 0 ? lineItemsAmount : amountParam;

    const record = {
      referenceNumber: refNumber,
      paymentMethodId: sessionId || 'pm_checkout_' + Date.now().toString(36),
      method: methodParam,
      amount: actualAmount,
      purpose: purposeParam,
      notes: pending?.notes || 'Completed via PayMongo Official Checkout',
      tenantName: tenantNameVal,
      tenantEmail: userEmail,
      dateFormatted: formatPaymentDateTime({ createdAt: new Date() }),
      createdAt: new Date().toISOString(),
      status: 'Paid'
    };

    window.history.replaceState({}, document.title, window.location.pathname);
    switchTab('payment');
    await saveAndFinalizePayment(record);
  }
  // SCENARIO 3: RETURN FROM PAYMONGO HOSTED CHECKOUT (FAILED OR CANCELLED via cancel_url)
  else if (paymentStatus === 'failed' || paymentStatus === 'cancelled') {
    const sessionId = pending?.sessionId || urlParams.get('sessionId') || '';
    let failureDetail = 'Payment declined / 3DS authentication failed on PayMongo';

    console.log('[PayReturn] Scenario 3 - failed/cancelled. sessionId:', sessionId);

    if (sessionId && PayMongo) {
      try {
        const sessionData = await PayMongo.getCheckoutSession(sessionId);
        console.log('[PayReturn] Scenario 3 session data:', sessionData);
        if (sessionData) {
          const lastErr = sessionData.attributes?.payment_intent?.attributes?.last_payment_error;
          if (lastErr && (lastErr.failed_message || lastErr.detail)) {
            failureDetail = lastErr.failed_message || lastErr.detail;
          }
        }
      } catch (err) {
        console.warn('[PayReturn] Scenario 3 getCheckoutSession error:', err);
      }
    }

    const refNumber = pending?.referenceNumber || 'PM-FAIL-' + Date.now().toString().slice(-6);
    const record = {
      referenceNumber: refNumber,
      paymentMethodId: sessionId || 'pm_failed_' + Date.now().toString(36),
      method: pending?.method || 'Credit/Debit Card (PayMongo Checkout)',
      amount: amountParam,
      purpose: purposeParam,
      notes: pending?.notes || 'PayMongo Checkout: 3DS Test Failed / Cancelled',
      failureReason: failureDetail,
      tenantName: tenantNameVal,
      tenantEmail: userEmail,
      dateFormatted: new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }),
      status: 'Failed'
    };

    window.history.replaceState({}, document.title, window.location.pathname);
    switchTab('payment');
    // Save receipt FIRST — non-blocking expire after
    await saveFailedPayment(record);
    // Fire-and-forget: expire session so PayMongo dashboard shows it as expired
    if (sessionId && PayMongo?.expireCheckoutSession) {
      PayMongo.expireCheckoutSession(sessionId).catch(() => { });
    }
  }
}

// Initialize on DOM load or immediately if already loaded
async function initPortal() {
  if (hasPendingPaymentReturn()) {
    switchTab('payment');
  }
  updateSubmitButton();
  try {
    await authReady;
  } catch (e) { }
  await Promise.all([loadTenantPaymentHistory(), checkUrlPaymentReturn()]);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initPortal);
} else {
  initPortal();
}

// Handle Back-Forward Cache (BF cache) restores:
// When the user presses the browser Back button from PayMongo's checkout page,
// the browser restores this page from BF cache WITHOUT firing DOMContentLoaded.
// pageshow fires in both fresh load and BF-cache restore cases.
let paymentReturnChecked = false;
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // Page restored from BF cache — re-run payment return check
    console.log('[PayReturn] BF-cache restore detected — re-checking payment return');
    paymentReturnChecked = false;
    checkUrlPaymentReturn();
  }
});

// Also handle tab visibility change as a secondary fallback
// (some mobile browsers use this instead of pageshow for back navigation)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !paymentReturnChecked) {
    const pendingRaw =
      sessionStorage.getItem('pending_paymongo_payment') ||
      localStorage.getItem('pending_paymongo_payment');
    if (pendingRaw) {
      console.log('[PayReturn] visibilitychange with pending payment — checking');
      paymentReturnChecked = true;
      checkUrlPaymentReturn();
    }
  }
});

let latestTenantChatMs = 0;

function resolveMessageTimeMs(item) {
  const raw = item?._serverCreatedAt || item?.createdAt;
  if (!raw) return 0;
  if (typeof raw?.seconds === 'number') return raw.seconds * 1000;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function subscribeTenantMessages() {
  if (!userEmail) return;
  try {
    const messagesRef = supabaseData.collection(supabase, 'messages');
    const q = supabaseData.query(messagesRef, supabaseData.where('email', '==', userEmail));
    supabaseData.onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot) return;
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        const docs = (snapshot.docs || [])
          .map((doc) => doc.data())
          .filter((item) => item.sender === 'tenant' || item.sender === 'admin');
        docs.sort((a, b) => resolveMessageTimeMs(a) - resolveMessageTimeMs(b));

        latestTenantChatMs = docs.reduce(
          (max, item) => Math.max(max, resolveMessageTimeMs(item)),
          0
        );

        if (!docs.length) {
          chatMessages.innerHTML = `
            <div class="no-messages-placeholder" style="text-align: center; color: #94a3b8; padding: 40px 20px; font-size: 14px;">
              No messages yet. Send a message below to reach the property administrator.
            </div>`;
          return;
        }

        chatMessages.innerHTML = '';
        docs.forEach((item) => {
          const msgBubble = document.createElement('div');
          msgBubble.className =
            item.sender === 'tenant' ? 'message-bubble sent' : 'message-bubble received';
          const timeMs = resolveMessageTimeMs(item);
          const dateObj = timeMs ? new Date(timeMs) : new Date();
          const timeStr = dateObj.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });

          const textDiv = document.createElement('div');
          textDiv.textContent = item.message || '';
          const timeDiv = document.createElement('div');
          timeDiv.className = 'message-time-stamp';
          timeDiv.textContent = timeStr;

          msgBubble.appendChild(textDiv);
          msgBubble.appendChild(timeDiv);
          chatMessages.appendChild(msgBubble);

          if (item.reply) {
            const replyBubble = document.createElement('div');
            replyBubble.className = 'message-bubble received';
            const replyText = document.createElement('div');
            replyText.textContent = item.reply;
            const replyTime = document.createElement('div');
            replyTime.className = 'message-time-stamp';
            replyTime.textContent = 'Admin response';
            replyBubble.appendChild(replyText);
            replyBubble.appendChild(replyTime);
            chatMessages.appendChild(replyBubble);
          }
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
        requestAnimationFrame(() => {
          chatMessages.scrollTop = chatMessages.scrollHeight;
        });
      },
      (err) => console.warn('Messages subscription error:', err)
    );
  } catch (err) {
    console.warn('Could not sync messages:', err);
  }
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const messageText = (input?.value || '').trim();
  if (!messageText) return;

  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message-bubble sent';
  const safeMs = Math.max(Date.now(), latestTenantChatMs + 1000);
  latestTenantChatMs = safeMs;
  const now = new Date(safeMs);
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  messageDiv.innerHTML = `
        <div>${escapeHtml(messageText)}</div>
        <div class="message-time-stamp">Today, ${timeStr}</div>
    `;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  input.value = '';

  const tenantName = sessionStorage.getItem('tenantName') || userEmail.split('@')[0] || 'Tenant';

  try {
    const messagesRef = supabaseData.collection(supabase, 'messages');
    await supabaseData.addDoc(messagesRef, {
      name: tenantName,
      email: userEmail,
      message: messageText,
      status: 'Unread',
      sender: 'tenant',
      createdAt: now.toISOString(),
      reply: null
    });
  } catch (error) {
    console.error('Supabase send message failed:', error);
  }
}

window.addEventListener('load', function () {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});

// ---------------------------------------------------------------------------
// Event delegation
//
// These controls were inline onclick/onkeypress attributes calling functions
// declared in a classic script. In a module those functions are not visible
// to inline handlers, so the markup now carries data-* attributes instead.
// ---------------------------------------------------------------------------

document.addEventListener('click', function (event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const tabTrigger = target.closest('[data-tab-target]');
  if (tabTrigger) {
    switchTab(tabTrigger.dataset.tabTarget, event);
    return;
  }

  const button = target.closest('[data-action]');
  if (!button) return;

  switch (button.dataset.action) {
    case 'logout':
      logout();
      break;
    case 'send-message':
      sendMessage();
      break;
    case 'save-profile':
      saveProfile();
      break;
    case 'view-receipt': {
      const idx = parseInt(button.dataset.index, 10);
      const record = cachedPayments[idx];
      if (record) {
        showReceiptModal(record);
      }
      break;
    }
    case 'quick-amount': {
      const amtAttr = button.dataset.amount;
      const paymentAmountInput = document.getElementById('paymentAmount');
      if (paymentAmountInput) {
        if (amtAttr === 'full') {
          paymentAmountInput.value = (
            currentRemainingDue > 0 ? currentRemainingDue : tenantRent
          ).toString();
        } else {
          paymentAmountInput.value = amtAttr;
        }
        updateSubmitButton();
      }
      break;
    }
    case 'close-qr-modal':
      closeQrModal();
      break;
    case 'confirm-qr-payment':
      confirmQrPayment();
      break;
    case 'close-receipt-modal':
      closeReceiptModal();
      break;
    case 'print-receipt':
      printReceipt();
      break;
    case 'tenant-cal-prev':
      tenantCalMonth -= 1;
      if (tenantCalMonth < 0) {
        tenantCalMonth = 11;
        tenantCalYear -= 1;
      }
      renderTenantPaymentCalendar();
      break;
    case 'tenant-cal-next':
      tenantCalMonth += 1;
      if (tenantCalMonth > 11) {
        tenantCalMonth = 0;
        tenantCalYear += 1;
      }
      renderTenantPaymentCalendar();
      break;
    case 'tenant-cal-today':
      tenantCalYear = new Date().getFullYear();
      tenantCalMonth = new Date().getMonth();
      tenantSelectedDateKey = '';
      renderTenantPaymentCalendar();
      break;
    case 'tenant-cal-select-day':
      tenantSelectedDateKey = button.dataset.dateKey || '';
      renderTenantPaymentCalendar();
      break;
    case 'tenant-3d-xray': {
      ensureTenantBuilding3DInitialized();
      tenant3DXrayEnabled = !tenant3DXrayEnabled;
      if (tenantBuilding3D) tenantBuilding3D.setXrayMode(tenant3DXrayEnabled);
      button.classList.toggle('active', tenant3DXrayEnabled);
      button.textContent = tenant3DXrayEnabled ? 'X-Ray Mode: ON' : 'X-Ray Mode: OFF';
      break;
    }
    case 'tenant-3d-spin': {
      ensureTenantBuilding3DInitialized();
      tenant3DSpinEnabled = !tenant3DSpinEnabled;
      if (tenantBuilding3D) tenantBuilding3D.setAutoRotate(tenant3DSpinEnabled);
      button.classList.toggle('active', tenant3DSpinEnabled);
      button.textContent = tenant3DSpinEnabled ? 'Auto-Spin: ON' : 'Auto-Spin: OFF';
      break;
    }
    case 'tenant-3d-my-unit': {
      ensureTenantBuilding3DInitialized();
      const ownUnit = resolveBuildingUnit(tenantRoom, tenantDorm) || BUILDING_UNITS[4];
      tenantSelected3DUnitId = ownUnit.id;
      const floorStr = String(ownUnit.floor);
      if (tenantBuilding3D) {
        tenantBuilding3D.setFloorFilter(floorStr);
        tenantBuilding3D.selectUnit(ownUnit.id);
      }
      document.querySelectorAll('[data-action="tenant-3d-floor"]').forEach((pill) => {
        pill.classList.toggle('active', pill.dataset.floor === floorStr);
      });
      renderTenant3DUnitInspector(ownUnit);
      break;
    }
    case 'tenant-3d-reset': {
      ensureTenantBuilding3DInitialized();
      tenant3DXrayEnabled = true;
      tenant3DSpinEnabled = true;
      if (tenantBuilding3D) {
        tenantBuilding3D.setXrayMode(true);
        tenantBuilding3D.setAutoRotate(true);
        tenantBuilding3D.setFloorFilter('all');
        tenantBuilding3D.resetCamera();
      }
      const xrayBtn = document.getElementById('tenant3DXrayBtn');
      if (xrayBtn) {
        xrayBtn.classList.add('active');
        xrayBtn.textContent = 'X-Ray Mode: ON';
      }
      const spinBtn = document.getElementById('tenant3DSpinBtn');
      if (spinBtn) {
        spinBtn.classList.add('active');
        spinBtn.textContent = 'Auto-Spin: ON';
      }
      document.querySelectorAll('[data-action="tenant-3d-floor"]').forEach((pill) => {
        pill.classList.toggle('active', pill.dataset.floor === 'all');
      });
      break;
    }
    case 'tenant-3d-floor': {
      ensureTenantBuilding3DInitialized();
      const floor = button.dataset.floor || 'all';
      if (tenantBuilding3D) tenantBuilding3D.setFloorFilter(floor);
      document.querySelectorAll('[data-action="tenant-3d-floor"]').forEach((pill) => {
        pill.classList.toggle('active', pill.dataset.floor === floor);
      });
      break;
    }
    case 'tenant-3d-select-unit': {
      ensureTenantBuilding3DInitialized();
      const unitId = button.dataset.unitId || '';
      const unit = BUILDING_UNITS.find((u) => u.id === unitId);
      if (unit) {
        tenantSelected3DUnitId = unit.id;
        if (tenantBuilding3D) tenantBuilding3D.selectUnit(unit.id);
      }
      break;
    }
    default:
      break;
  }
});

document.addEventListener('keydown', function (event) {
  if (event.key !== 'Enter') return;
  if (!(event.target instanceof Element)) return;
  if (!event.target.closest('[data-action="send-message"], #messageInput')) return;
  event.preventDefault();
  sendMessage();
});
