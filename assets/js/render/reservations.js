/**
 * Reservation request rendering and decisions (admin dashboard).
 *
 * All data access goes through supabase-service.js.
 */

import { db, supabaseData, getReservationsRef, isDataReady } from '../supabase-service.js';
import { escapeHtml } from '../lib/format.js';
import { attr } from '../lib/dom.js';
import { Toast } from './toast.js';
import { decrementRoomAvailability } from '../room-availability.js';

const STATUS_CLASS = {
  Approved: 'px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800',
  Declined: 'px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800',
  Rejected: 'px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800',
  Pending: 'px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800'
};

function formatTimestampLog(raw) {
  if (!raw) return 'Timestamp unavailable';
  const ms = typeof raw?.seconds === 'number' ? raw.seconds * 1000 : new Date(raw).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return String(raw);
  return new Date(ms).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Displays a full-screen/modal image viewer for inspecting uploaded Valid IDs.
 *
 * @param {string} src
 * @param {string} [title]
 */
export function openImageModal(src, title = 'Valid ID') {
  let modal = document.getElementById('imagePreviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'imagePreviewModal';
    modal.className =
      'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity';
    modal.innerHTML = `
      <div class="relative max-w-4xl max-h-[90vh] w-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div class="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <h3 id="imagePreviewTitle" class="text-sm font-bold text-gray-800 truncate"></h3>
          <button type="button" class="text-gray-400 hover:text-gray-700 text-2xl font-bold p-1 leading-none transition-colors" data-close-img-modal aria-label="Close">&times;</button>
        </div>
        <div class="p-4 overflow-auto flex items-center justify-center bg-gray-900/5 min-h-[300px]">
          <img id="imagePreviewImg" class="max-w-full max-h-[75vh] rounded-lg shadow object-contain" alt="Valid ID Full View" />
        </div>
      </div>
    `;
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close-img-modal]')) {
        modal.classList.add('hidden');
      }
    });
    document.body.appendChild(modal);
  }
  const imgEl = modal.querySelector('#imagePreviewImg');
  const titleEl = modal.querySelector('#imagePreviewTitle');
  if (imgEl) imgEl.src = src;
  if (titleEl) titleEl.textContent = title;
  modal.classList.remove('hidden');
}

function renderReservationCard(doc) {
  const data = doc.data();
  const status = data.status || 'Pending';
  const statusClass = STATUS_CLASS[status] ?? STATUS_CLASS.Pending;
  const requestDate = data.moveInDate || 'Not specified';
  const isCommercial = String(data.room || '')
    .toLowerCase()
    .includes('commercial');
  const defaultRent = isCommercial ? 10000 : 5000;
  const amountVal = Number(data.amount) || defaultRent;
  const amount = `₱${amountVal.toLocaleString()}/mo`;
  const receivedAtLabel = formatTimestampLog(data.createdAt);
  const decisionAtLabel = data.decisionAt ? formatTimestampLog(data.decisionAt) : '';

  let validId = null;
  let notes = '';
  const rawAdditional = data.additionalInfo || data.additional_info;
  if (rawAdditional) {
    if (typeof rawAdditional === 'object') {
      validId = rawAdditional.validId || null;
      notes = rawAdditional.notes || '';
    } else if (typeof rawAdditional === 'string') {
      if (rawAdditional.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(rawAdditional);
          validId = parsed.validId || null;
          notes = parsed.notes || '';
        } catch {
          notes = rawAdditional;
        }
      } else {
        notes = rawAdditional;
      }
    }
  }

  const prefill = escapeHtml(
    JSON.stringify({
      name: data.name || '',
      email: data.email || '',
      phone: data.phone || '',
      room: data.room || '',
      dormName: isCommercial ? 'Commercial Space' : 'Triple Occupancy Room',
      moveInDate: data.moveInDate || '',
      amount: amountVal
    })
  );

  let actions;
  if (status === 'Approved') {
    actions = `
      <button type="button" data-action="create-tenant" data-payload="${prefill}" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 text-sm font-semibold shadow-sm cursor-pointer">
        Create Tenant Account
      </button>
      <button type="button" data-action="email-reservation" data-email="${attr(data.email || '')}" data-name="${attr(data.name || '')}" data-room="${attr(data.room || '')}" data-status="Approved" data-move-in-date="${attr(requestDate)}" class="px-3 py-2 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5" title="Send Approval Email to applicant">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
        Send Approval Email
      </button>
      <button type="button" data-action="delete-reservation" data-id="${attr(doc.id)}" class="px-3 py-2 border border-gray-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-semibold cursor-pointer">
        Remove
      </button>`;
  } else if (status === 'Pending') {
    actions = `
      <button type="button" data-action="approve" data-id="${attr(doc.id)}" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold cursor-pointer">Approve</button>
      <button type="button" data-action="decline" data-id="${attr(doc.id)}" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold cursor-pointer">Decline</button>`;
  } else {
    actions = `
      <button type="button" data-action="email-reservation" data-email="${attr(data.email || '')}" data-name="${attr(data.name || '')}" data-room="${attr(data.room || '')}" data-status="Declined" data-reason="${attr(data.declineReason || '')}" class="px-3 py-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5" title="Send Decline Email to applicant">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
        Send Decline Email
      </button>
      <button type="button" data-action="delete-reservation" data-id="${attr(doc.id)}" class="px-3 py-2 border border-gray-200 hover:bg-red-50 text-red-600 rounded-lg text-xs font-semibold cursor-pointer">
        Remove
      </button>`;
  }

  const validIdHtml = validId
    ? `
      <div class="mt-4 pt-3 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div>
          <span class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Uploaded Valid ID</span>
          <div class="relative group cursor-pointer inline-block rounded-lg overflow-hidden border border-gray-200 shadow-sm"
               data-action="view-id" data-src="${attr(validId)}" data-title="Valid ID: ${attr(data.name || 'Guest')}">
            <img src="${escapeHtml(validId)}" alt="Valid ID" class="w-32 h-20 object-cover group-hover:scale-105 transition-transform" />
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/></svg>
              Click to Zoom
            </div>
          </div>
        </div>
        <button type="button" data-action="view-id" data-src="${attr(validId)}" data-title="Valid ID: ${attr(data.name || 'Guest')}"
                class="text-xs text-blue-600 hover:text-blue-800 font-medium underline flex items-center gap-1 sm:self-end sm:mb-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
          View Full Resolution ID
        </button>
      </div>
    `
    : `
      <div class="mt-3 pt-2 border-t border-gray-100 text-xs text-gray-400 italic">No Valid ID attached.</div>
    `;

  return `
    <div class="bg-white border rounded-xl p-6 shadow-sm">
      <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div class="flex-1">
          <div class="flex flex-wrap items-center gap-2.5 mb-2">
            <h4 class="text-lg font-bold text-gray-900">${escapeHtml(data.name || 'Guest')}</h4>
            <span class="${statusClass}">${escapeHtml(status)}</span>
            <span class="text-xs text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full font-medium">
              Received: ${escapeHtml(receivedAtLabel)}
            </span>
            ${decisionAtLabel ? `<span class="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-0.5 rounded-full">${escapeHtml(status)} on ${escapeHtml(decisionAtLabel)}</span>` : ''}
          </div>
          <div class="text-sm text-gray-600 space-y-1">
            <div><span class="font-medium text-gray-700">Property:</span> ${escapeHtml(data.room || 'Unknown')}</div>
            <div><span class="font-medium text-gray-700">Email:</span> ${escapeHtml(data.email || 'N/A')} &bull; <span class="font-medium text-gray-700">Phone:</span> ${escapeHtml(data.phone || 'N/A')}</div>
            <div><span class="font-medium text-gray-700">Preferred Move-in Date:</span> ${escapeHtml(requestDate)}</div>
            ${data.message ? `<div class="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 text-gray-700 mt-2"><span class="font-semibold text-blue-900 block text-xs uppercase tracking-wide mb-0.5">Message from Applicant:</span>${escapeHtml(data.message)}</div>` : ''}
            ${notes ? `<div class="bg-gray-50 p-2.5 rounded-lg border border-gray-200 text-gray-700 mt-2"><span class="font-semibold text-gray-800 block text-xs uppercase tracking-wide mb-0.5">Additional Info:</span>${escapeHtml(notes)}</div>` : ''}
            ${data.declineReason ? `<div class="bg-red-50 p-2.5 rounded-lg border border-red-200 text-red-700 mt-2 text-xs"><span class="font-semibold uppercase tracking-wide">Decline Reason:</span> ${escapeHtml(data.declineReason)}</div>` : ''}
            <div class="text-green-600 font-semibold pt-1">Target Monthly Rent: ${escapeHtml(amount)}</div>
          </div>
          ${validIdHtml}
        </div>
        <div class="flex items-center gap-2 self-start md:self-auto">${actions}</div>
      </div>
    </div>`;
}

export function renderReservationRequests(docs) {
  const container = document.getElementById('reservationRequestsContainer');
  if (!container) return;

  const docList = Array.isArray(docs) ? docs : docs?.docs || [];
  const pendingDocs = docList.filter((d) => (d.data().status || 'Pending') === 'Pending');
  const historyDocs = docList.filter((d) => (d.data().status || 'Pending') !== 'Pending');

  const pendingHtml = pendingDocs.length
    ? `<div class="space-y-4">${pendingDocs.map(renderReservationCard).join('')}</div>`
    : '<div class="bg-white border rounded-xl p-6 text-gray-600">No pending reservation requests at the moment.</div>';

  const historyHtml = historyDocs.length
    ? `
      <div class="mt-8 pt-6 border-t border-gray-200">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h4 class="text-lg font-bold text-gray-900">Approved &amp; Processed Reservations</h4>
            <p class="text-xs text-gray-500">Approved applicants can be enrolled directly into a Tenant Account below.</p>
          </div>
          <span class="bg-gray-100 text-gray-700 text-xs font-semibold px-2.5 py-1 rounded-full">${historyDocs.length} Processed</span>
        </div>
        <div class="space-y-4">
          ${historyDocs.map(renderReservationCard).join('')}
        </div>
      </div>`
    : '';

  container.innerHTML = pendingHtml + historyHtml;
}

const OFFICIAL_SUPPORT_GMAIL = 'homespotapartment@gmail.com';

/**
 * Opens email draft (via Gmail web or native mailto) notifying the applicant of reservation decision.
 *
 * @param {{
 *   email: string,
 *   name?: string,
 *   room?: string,
 *   status: 'Approved' | 'Declined',
 *   reason?: string,
 *   moveInDate?: string
 * }} params
 */
export function sendReservationNotificationEmail({
  email,
  name,
  room,
  status,
  reason,
  moveInDate
}) {
  if (!email) {
    Toast.error('No email address available for this applicant.');
    return;
  }

  const cleanName = (name || 'Applicant').trim();
  const cleanRoom = (room || 'Apartment Unit').trim();
  const isApproved = status === 'Approved';

  const subject = isApproved
    ? `[HomeSpot] Reservation Approved - ${cleanRoom}`
    : `[HomeSpot] Reservation Update - ${cleanRoom}`;

  const bodyText = isApproved
    ? `Hi ${cleanName},\n\n` +
    `Great news! Your reservation request for ${cleanRoom} at MJP Residences (HomeSpot) has been APPROVED.\n\n` +
    (moveInDate ? `Target Move-in Date: ${moveInDate}\n\n` : '') +
    `Next Steps:\n` +
    `1. Please prepare 1 valid government ID and your advance/security deposit payment.\n` +
    `2. Visit the property owner to sign your lease agreement..\n` +
    `3. Once deposit has been received, your Tenant Portal account will be activated.\n\n` +
    `If you have any questions or schedule adjustments, please reply directly to this email.\n\n` +
    `Best regards,\n` +
    `HomeSpot Management Team\n` +
    `MJP Residences\n` +
    `Contact: ${OFFICIAL_SUPPORT_GMAIL}`
    : `Hi ${cleanName},\n\n` +
    `Thank you for your interest in MJP Residences (HomeSpot).\n\n` +
    `We regret to inform you that we are currently unable to approve your reservation request for ${cleanRoom}.` +
    (reason ? `\n\nReason: ${reason}` : '') +
    `\n\nIf you would like to explore other available rooms or adjust your dates, please reply to this email or visit our website.\n\n` +
    `Best regards,\n` +
    `HomeSpot Management Team\n` +
    `MJP Residences\n` +
    `Contact: ${OFFICIAL_SUPPORT_GMAIL}`;

  const su = encodeURIComponent(subject);
  const body = encodeURIComponent(bodyText);
  const composeTarget = `https://mail.google.com/mail/?authuser=${encodeURIComponent(OFFICIAL_SUPPORT_GMAIL)}&view=cm&fs=1&to=${encodeURIComponent(email)}&su=${su}&body=${body}`;
  const gmailUrl = `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(OFFICIAL_SUPPORT_GMAIL)}&continue=${encodeURIComponent(composeTarget)}`;

  const win = window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  if (!win || win.closed || typeof win.closed === 'undefined') {
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${su}&body=${body}`;
  }
}

/**
 * Approves a reservation, decrements the room's availability, and offers to email applicant.
 * @param {string} reservationId
 */
export async function approveReservation(reservationId) {
  if (!isDataReady()) {
    Toast.error('Supabase is not available.');
    return;
  }

  let reservationData = null;
  try {
    const ref = supabaseData.doc(db, 'reservations', reservationId);
    const snap = await supabaseData.getDoc(ref);
    if (snap.exists()) {
      reservationData = snap.data();
    }
    await supabaseData.updateDoc(ref, {
      status: 'Approved',
      decisionAt: supabaseData.serverTimestamp()
    });
    Toast.success('Reservation approved. You can now click "Create Tenant Account" below.');
  } catch (error) {
    console.error('Supabase approve failed:', error);
    Toast.error('Unable to approve reservation.');
    return;
  }

  try {
    if (reservationData?.room) {
      await decrementRoomAvailability(reservationData.room);
    }
  } catch (error) {
    console.error('Failed to decrement room availability:', error);
  }

  if (reservationData?.email) {
    const sendMail = await Toast.confirm({
      title: 'Send Approval Email?',
      message: `Send an approval notification email to ${reservationData.name || 'the applicant'} (${reservationData.email})?`,
      confirmText: 'Send Email',
      cancelText: 'Skip'
    });
    if (sendMail) {
      sendReservationNotificationEmail({
        email: reservationData.email,
        name: reservationData.name,
        room: reservationData.room,
        moveInDate: reservationData.moveInDate,
        status: 'Approved'
      });
    }
  }
}

/**
 * Declines a reservation, optionally recording a reason and emailing the applicant.
 * @param {string} reservationId
 */
export async function declineReservation(reservationId) {
  const reason = await Toast.prompt({
    title: 'Decline Reservation Request',
    message: 'Enter a reason for declining (optional):',
    placeholder: 'e.g. Selected room is currently unavailable',
    confirmText: 'Decline Reservation',
    cancelText: 'Cancel',
    danger: true
  });
  if (reason === null) return;

  if (!isDataReady()) {
    Toast.error('Supabase is not available.');
    return;
  }

  let reservationData = null;
  try {
    const ref = supabaseData.doc(db, 'reservations', reservationId);
    const snap = await supabaseData.getDoc(ref);
    if (snap.exists()) {
      reservationData = snap.data();
    }
    await supabaseData.updateDoc(ref, {
      status: 'Declined',
      declineReason: reason || null,
      decisionAt: supabaseData.serverTimestamp()
    });
    Toast.success('Reservation declined.');
  } catch (error) {
    console.error('Supabase decline failed:', error);
    Toast.error('Unable to decline reservation.');
    return;
  }

  if (reservationData?.email) {
    const sendMail = await Toast.confirm({
      title: 'Send Decline Email?',
      message: `Send a decline notification email with the reason to ${reservationData.name || 'the applicant'} (${reservationData.email})?`,
      confirmText: 'Send Email',
      cancelText: 'Skip'
    });
    if (sendMail) {
      sendReservationNotificationEmail({
        email: reservationData.email,
        name: reservationData.name,
        room: reservationData.room,
        reason: reason || reservationData.declineReason,
        status: 'Declined'
      });
    }
  }
}

/**
 * Deletes a processed reservation record.
 * @param {string} reservationId
 */
export async function deleteReservation(reservationId) {
  if (!reservationId || !isDataReady()) return;
  const confirmed = await Toast.confirm({
    title: 'Remove Reservation Record',
    message: 'Remove this reservation record from the list?',
    confirmText: 'Remove',
    cancelText: 'Cancel',
    danger: true
  });
  if (!confirmed) return;

  try {
    await supabaseData.deleteDoc(supabaseData.doc(db, 'reservations', reservationId));
    Toast.success('Reservation record removed.');
  } catch (error) {
    console.error('Failed to delete reservation:', error);
    Toast.error('Unable to remove reservation record.');
  }
}

/**
 * Subscribes to all reservations (ordered newest first), updating pending badges
 * and rendering both Pending requests and Approved/Declined history.
 * @param {(count: number) => void} [onCount]
 */
export function watchPendingReservations(onCount) {
  const ref = getReservationsRef();
  if (!ref) return null;

  return supabaseData.onSnapshot(
    supabaseData.query(ref, supabaseData.orderBy('createdAt', 'desc')),
    (snapshot) => {
      const docs = snapshot.docs || [];
      const pendingCount = docs.filter((d) => (d.data().status || 'Pending') === 'Pending').length;
      const tabBadge = document.getElementById('reservationsTabBadge');
      if (tabBadge) {
        tabBadge.textContent = String(pendingCount);
      }
      onCount?.(pendingCount);
      renderReservationRequests(snapshot);
    },
    (error) => {
      console.error('Reservations subscription failed:', error);
    }
  );
}
