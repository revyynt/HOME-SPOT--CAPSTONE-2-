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

      return `
        <div class="bg-white border rounded-lg p-6">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <h4 class="text-lg font-bold">${escapeHtml(data.name || 'Guest')}</h4>
                <span class="${statusClass}">${escapeHtml(status)}</span>
              </div>
              <div class="text-sm text-gray-600 space-y-1">
                <div>Property: ${escapeHtml(data.room || 'Unknown')}</div>
                <div>Move-in Date: ${escapeHtml(requestDate)}</div>
                ${data.message ? `<div>Message: ${escapeHtml(data.message)}</div>` : ''}
                <div class="text-green-600 font-medium">Amount: ${escapeHtml(amount)}</div>
              </div>
            </div>
            <div class="flex items-center gap-2">${actions}</div>
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
