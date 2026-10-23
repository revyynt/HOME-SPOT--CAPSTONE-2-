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
  Approved: 'px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800',
  Declined: 'px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800',
  Pending: 'px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800'
};

/**
 * Renders pending reservations into #reservationRequestsContainer.
 *
 * Row actions are delegated (see wireReservationActions) rather than bound
 * inline, so data values never end up inside JavaScript strings.
 *
 * @param {{ empty: boolean, map: (callback: (doc: {id: string, data: () => Object}) => string) => string[] }} docs
 */
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

export function renderReservationRequests(docs) {
  const container = document.getElementById('reservationRequestsContainer');
  if (!container) return;

  if (docs.empty) {
    container.innerHTML =
      '<div class="bg-white border rounded-lg p-6 text-gray-600">No pending reservation requests at the moment.</div>';
    return;
  }

  container.innerHTML = docs
    .map((doc) => {
      const data = doc.data();
      const status = data.status || 'Pending';
      const statusClass = STATUS_CLASS[status] ?? STATUS_CLASS.Pending;
      const requestDate = data.moveInDate || 'Not specified';
      const amount = data.amount ? `₱${Number(data.amount).toLocaleString()}` : 'TBD';

      // Parse additionalInfo to extract validId and optional notes
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

      // Carried on a data-* attribute so no value is interpolated into JS.
      const prefill = escapeHtml(
        JSON.stringify({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          room: data.room || '',
          moveInDate: requestDate,
          amount: data.amount || 5000
        })
      );

      const actions =
        status === 'Approved'
          ? `<button data-action="create-tenant" data-payload="${prefill}" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm">Create Tenant Account</button>`
          : `<button data-action="approve" data-id="${attr(doc.id)}" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">Approve</button>
             <button data-action="decline" data-id="${attr(doc.id)}" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg">Decline</button>`;

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
        <div class="bg-white border rounded-lg p-6 shadow-sm">
          <div class="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h4 class="text-lg font-bold text-gray-800">${escapeHtml(data.name || 'Guest')}</h4>
                <span class="${statusClass}">${escapeHtml(status)}</span>
              </div>
              <div class="text-sm text-gray-600 space-y-1">
                <div><span class="font-medium text-gray-700">Property:</span> ${escapeHtml(data.room || 'Unknown')}</div>
                <div><span class="font-medium text-gray-700">Email:</span> ${escapeHtml(data.email || 'N/A')} &bull; <span class="font-medium text-gray-700">Phone:</span> ${escapeHtml(data.phone || 'N/A')}</div>
                <div><span class="font-medium text-gray-700">Move-in Date:</span> ${escapeHtml(requestDate)}</div>
                ${data.message ? `<div class="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100 text-gray-700 mt-2"><span class="font-semibold text-blue-900 block text-xs uppercase tracking-wide mb-0.5">Message from Applicant:</span>${escapeHtml(data.message)}</div>` : ''}
                ${notes ? `<div class="bg-gray-50 p-2.5 rounded-lg border border-gray-200 text-gray-700 mt-2"><span class="font-semibold text-gray-800 block text-xs uppercase tracking-wide mb-0.5">Additional Info:</span>${escapeHtml(notes)}</div>` : ''}
                <div class="text-green-600 font-semibold pt-1">Target Monthly Rent: ${escapeHtml(amount)}</div>
              </div>
              ${validIdHtml}
            </div>
            <div class="flex items-center gap-2 self-start md:self-auto">${actions}</div>
          </div>
        </div>`;
    })
    .join('');
}

/**
 * Approves a reservation and decrements the room's availability.
 * @param {string} reservationId
 */
export async function approveReservation(reservationId) {
  if (!isDataReady()) {
    Toast.error('Supabase is not available.');
    return;
  }

  try {
    const ref = supabaseData.doc(db, 'reservations', reservationId);
    await supabaseData.updateDoc(ref, {
      status: 'Approved',
      decisionAt: supabaseData.serverTimestamp()
    });
    Toast.success('Reservation approved.');
  } catch (error) {
    console.error('Supabase approve failed:', error);
    Toast.error('Unable to approve reservation.');
    return;
  }

  // The snapshot refresh is driven by Realtime, but re-read the request to
  // find which room to decrement.
  try {
    const ref = supabaseData.doc(db, 'reservations', reservationId);
    const snap = await supabaseData.getDoc(ref);
    if (snap.exists() && snap.data().room) {
      await decrementRoomAvailability(snap.data().room);
    }
  } catch (error) {
    console.error('Failed to decrement room availability:', error);
  }
}

/**
 * Declines a reservation, optionally recording a reason.
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

  try {
    const ref = supabaseData.doc(db, 'reservations', reservationId);
    await supabaseData.updateDoc(ref, {
      status: 'Declined',
      declineReason: reason || null,
      decisionAt: supabaseData.serverTimestamp()
    });
    Toast.success('Reservation declined.');
  } catch (error) {
    console.error('Supabase decline failed:', error);
    Toast.error('Unable to decline reservation.');
  }
}

/**
 * Subscribes to pending reservations.
 * @param {(count: number) => void} [onCount]
 */
export function watchPendingReservations(onCount) {
  const ref = getReservationsRef();
  if (!ref) return null;

  return supabaseData.onSnapshot(
    supabaseData.query(ref, supabaseData.where('status', '==', 'Pending')),
    (snapshot) => {
      onCount?.(snapshot.size);
      renderReservationRequests(snapshot);
    },
    (error) => {
      console.error('Pending reservations subscription failed:', error);
    }
  );
}
