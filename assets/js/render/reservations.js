/**
 * Reservation request rendering and decisions (admin dashboard).
 *
 * All Firestore access goes through firebase-service.js -- this module used to
 * carry its own copy of the service bridge.
 */

import {
  db,
  firebaseFirestore,
  getReservationsRef,
  getRoomDocRef,
  isFirestoreReady
} from '../firebase-service.js';
import { escapeHtml } from '../lib/format.js';
import { attr } from '../lib/dom.js';
import { canApprove, canDecline, nextAvailability } from '../lib/booking.js';
import { renderActivity } from '../pages/admin-dashboard/rooms.js';
import { Toast } from './toast.js';

const STATUS_CLASS = {
  Approved: 'px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800',
  Converted: 'px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800',
  Declined: 'px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800',
  Pending: 'px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800'
};

/**
 * Renders the actionable reservations into #reservationRequestsContainer.
 *
 * Row actions are delegated (see wireReservationActions) rather than bound with
 * inline `onclick`, so Firestore values never end up inside a JS string.
 *
 * @param {import('firebase/firestore').QuerySnapshot} docs
 */
export function renderReservationRequests(docs) {
  const container = document.getElementById('reservationRequestsContainer');
  if (!container) return;

  if (docs.empty) {
    container.innerHTML =
      '<div class="bg-white border rounded-lg p-6 text-gray-600">No pending reservation requests at the moment.</div>';
    return;
  }

  const entries = docs.map((doc) => {
    const data = doc.data();
    const status = data.status || 'Pending';
    const statusClass = STATUS_CLASS[status] ?? STATUS_CLASS.Pending;
    const requestDate = data.moveInDate || 'Not specified';
    const amount = data.amount ? `₱${Number(data.amount).toLocaleString()}` : 'TBD';

    // Carried on a data-* attribute so no value is interpolated into JS.
    // reservationId lets the modal mark this request Converted once the
    // tenant account exists.
    const prefill = escapeHtml(
      JSON.stringify({
        reservationId: doc.id,
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

    const row = `
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

    return { row, status };
  });

  // Two sections so approved requests awaiting onboarding are visually distinct
  // from fresh requests, without hiding either. Declined and Converted rows are
  // fetched (to feed the activity feed) but are not drawn here.
  const actionable = entries.filter((e) => e.status === 'Pending' || e.status === 'Approved');
  const pendingRows = actionable.filter((e) => e.status === 'Pending').map((e) => e.row);
  const approvedRows = actionable.filter((e) => e.status === 'Approved').map((e) => e.row);

  if (!pendingRows.length && !approvedRows.length) {
    container.innerHTML =
      '<div class="bg-white border rounded-lg p-6 text-gray-600">No pending reservation requests at the moment.</div>';
    return;
  }

  const sections = [];
  if (pendingRows.length) {
    sections.push(
      `<h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">New Requests (${pendingRows.length})</h3>`,
      pendingRows.join('')
    );
  }
  if (approvedRows.length) {
    sections.push(
      `<h3 class="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-3 mt-6">Approved — awaiting tenant account (${approvedRows.length})</h3>`,
      approvedRows.join('')
    );
  }

  container.innerHTML = sections.join('');
}

/**
 * Approves a reservation and decrements the room's availability, atomically.
 *
 * Reads the request and the room inside one Firestore transaction, then writes
 * both. Firestore serializes transactions, so two admins clicking Approve (or
 * one double-clicking) can never both succeed: the second re-reads an
 * `Approved` request and is refused. It also refuses when the room is full,
 * which the previous non-atomic update-then-decrement pair did not.
 *
 * @param {string} reservationId
 * @returns {Promise<boolean>} whether the approval was applied
 */
export async function approveReservation(reservationId) {
  if (!isFirestoreReady() || !firebaseFirestore.runTransaction) {
    Toast.error('Firestore is not available.');
    return false;
  }

  try {
    const reservationRef = firebaseFirestore.doc(db, 'reservations', reservationId);

    const result = await firebaseFirestore.runTransaction(db, async (tx) => {
      const snap = await tx.get(reservationRef);
      if (!snap.exists()) return { ok: false, reason: 'missing' };

      const data = snap.data();
      const roomName = data.room;
      if (!roomName) return { ok: false, reason: 'no-room' };

      // Derive the room doc from the request's stored room name.
      const roomRef = getRoomDocRef(roomName);
      if (!roomRef) return { ok: false, reason: 'no-room-ref' };

      const roomSnap = await tx.get(roomRef);
      const available = roomSnap.exists() ? Number(roomSnap.data().available ?? 0) : 0;

      const decision = canApprove({ reservationStatus: data.status, available });
      if (!decision.ok) return { ok: false, reason: decision.reason };

      tx.update(reservationRef, {
        status: 'Approved',
        decisionAt: firebaseFirestore.serverTimestamp()
      });
      tx.update(roomRef, { available: nextAvailability(available) });

      return { ok: true, available: nextAvailability(available) };
    });

    if (!result.ok) {
      if (result.reason === 'already-decided') {
        Toast.error('This reservation was already processed.');
      } else if (result.reason === 'no-availability') {
        Toast.error('Cannot approve: this room is fully booked.');
      } else {
        Toast.error('Could not approve this reservation.');
      }
      return false;
    }

    Toast.success('Reservation approved.');
    return true;
  } catch (error) {
    console.error('Firestore approve transaction failed:', error);
    Toast.error('Unable to approve reservation.');
    return false;
  }
}

/**
 * Declines a reservation, optionally recording a reason.
 *
 * Guarded against re-deciding an already-processed request, so a double-click
 * or a second admin cannot overwrite an approval with a decline.
 *
 * @param {string} reservationId
 * @returns {Promise<boolean>}
 */
export async function declineReservation(reservationId) {
  const reason = prompt('Enter reason for declining (optional):');

  if (!isFirestoreReady()) {
    Toast.error('Firestore is not available.');
    return false;
  }

  try {
    const ref = firebaseFirestore.doc(db, 'reservations', reservationId);
    const snap = await firebaseFirestore.getDoc(ref);
    if (!snap.exists()) {
      Toast.error('This reservation no longer exists.');
      return false;
    }

    const decision = canDecline(snap.data().status);
    if (!decision.ok) {
      Toast.error('This reservation was already processed.');
      return false;
    }

    await firebaseFirestore.updateDoc(ref, {
      status: 'Declined',
      declineReason: reason || null,
      decisionAt: firebaseFirestore.serverTimestamp()
    });
    Toast.success('Reservation declined.');
    return true;
  } catch (error) {
    console.error('Firestore decline failed:', error);
    Toast.error('Unable to decline reservation.');
    return false;
  }
}

/**
 * Subscribes to the reservations the dashboard needs.
 *
 * Deliberately includes 'Approved' (and the other terminal states) alongside
 * 'Pending'. The list previously filtered to Pending only, which meant an
 * approved request vanished the instant it was approved -- taking the "Create
 * Tenant Account" button (which only renders for Approved) with it. The
 * onboarding step was therefore unreachable: approve, and the request
 * disappeared.
 *
 * renderReservationRequests only draws rows for Pending and Approved, so the
 * extra states are used solely to feed the overview's Recent Activity feed.
 *
 * @param {(count: number) => void} [onCount] - pending count for the badge
 */
export function watchPendingReservations(onCount) {
  const ref = getReservationsRef();
  if (!ref) return null;

  const query = firebaseFirestore.query(
    ref,
    firebaseFirestore.where('status', 'in', ['Pending', 'Approved', 'Declined', 'Converted'])
  );

  return firebaseFirestore.onSnapshot(
    query,
    (snapshot) => {
      const docs = snapshot.docs;
      // The badge counts only what still needs a decision.
      onCount?.(docs.filter((doc) => doc.data().status === 'Pending').length);
      renderReservationRequests(snapshot);
      renderActivity(docs.map((doc) => doc.data()));
    },
    (error) => {
      console.error('Pending reservations snapshot failed:', error);
    }
  );
}
