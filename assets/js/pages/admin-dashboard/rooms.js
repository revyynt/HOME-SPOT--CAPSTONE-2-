/**
 * Room availability management (admin dashboard).
 *
 * Replaces a Listings tab that showed invented rooms ("Single Occupancy Room,
 * 2/4, ₱5,500/mo") with inert Edit/View buttons. Availability could only be
 * changed through the set-room.js CLI, which needs a hand-copied Firebase ID
 * token.
 *
 * firestore.rules already grants `allow write: if isAdmin()` on `rooms`, so this
 * needs no server and no rule change. Writes go through the single existing
 * implementation in room-availability.js -- there is deliberately no second
 * write path.
 */

import { setRoomAvailability } from '../../room-availability.js';
import { clampAvailability } from '../../lib/booking.js';
import { escapeHtml } from '../../lib/format.js';
import { attr } from '../../lib/dom.js';
import { Toast } from '../../render/toast.js';

/** @type {Array<{id: string, name: string, available: number, capacity: number|null}>} */
let rooms = [];

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function statusBadge(available) {
  const full = available <= 0;
  const cls = full
    ? 'bg-red-100 text-red-800'
    : available <= 1
      ? 'bg-amber-100 text-amber-800'
      : 'bg-emerald-100 text-emerald-800';
  const label = full ? 'Fully Booked' : `${available} Available`;
  return `<span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${cls}">${escapeHtml(label)}</span>`;
}

/**
 * Renders the room list with an availability stepper per room.
 * @param {Array<{id: string, name: string, available: number, capacity: number|null}>} list
 */
export function renderRooms(list) {
  rooms = Array.isArray(list) ? list : [];

  const container = document.getElementById('roomsTableBody');
  if (container) {
    if (!rooms.length) {
      container.innerHTML =
        '<tr><td colspan="5" class="px-6 py-12 text-center text-gray-500">' +
        'No rooms yet. Room documents are created automatically when a visitor opens a listing page.</td></tr>';
    } else {
      container.innerHTML = rooms
        .map((room) => {
          const atCapacity = room.capacity !== null && room.available >= room.capacity;
          const incrementDisabled = atCapacity ? 'disabled' : '';
          const decrementDisabled = room.available <= 0 ? 'disabled' : '';

          const capacityCell =
            room.capacity !== null
              ? escapeHtml(String(room.capacity))
              : '<span class="text-gray-400">—</span>';

          return `
            <tr class="hover:bg-gray-50/70 transition-colors">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(room.name)}</td>
              <td class="px-6 py-4 whitespace-nowrap">${statusBadge(room.available)}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${capacityCell}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="inline-flex items-center gap-2">
                  <button
                    data-action="room-dec"
                    data-room="${attr(room.name)}"
                    ${decrementDisabled}
                    class="px-3 py-1 border rounded-lg text-sm font-bold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Decrease availability"
                  >−</button>
                  <span class="w-10 text-center text-sm font-semibold">${room.available}</span>
                  <button
                    data-action="room-inc"
                    data-room="${attr(room.name)}"
                    ${incrementDisabled}
                    class="px-3 py-1 border rounded-lg text-sm font-bold hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Increase availability"
                  >+</button>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-400">${escapeHtml(room.id)}</td>
            </tr>`;
        })
        .join('');
    }
  }

  updateOverviewStats();
}

function updateOverviewStats() {
  const total = rooms.length;
  const available = rooms.reduce((sum, room) => sum + (Number(room.available) || 0), 0);

  setText('statTotalListings', total);
  setText('statActiveBookings', available);

  const status = document.getElementById('roomsFirestoreStatus');
  if (status) {
    status.textContent = `Synced with Firestore (${total} room${total === 1 ? '' : 's'})`;
    status.className = 'text-xs text-emerald-600';
  }
}

/**
 * Renders a live "Recent Activity" feed from real reservation decisions.
 *
 * Replaces a static list that claimed bookings and messages had happened
 * ("New booking confirmed -- Single Occupancy Room - 2 hours ago").
 *
 * @param {Array<Object>} reservations - decision-shaped docs
 */
export function renderActivity(reservations) {
  const container = document.getElementById('overviewActivity');
  if (!container) return;

  const decided = (Array.isArray(reservations) ? reservations : [])
    .filter((r) => r && r.status && r.status !== 'Pending')
    .sort((a, b) => toMillis(b.decisionAt ?? b.createdAt) - toMillis(a.decisionAt ?? a.createdAt))
    .slice(0, 6);

  if (!decided.length) {
    container.innerHTML =
      '<p class="text-sm text-gray-500">No decisions yet. Approved and declined requests will appear here.</p>';
    return;
  }

  container.innerHTML = decided
    .map((r) => {
      const approved = r.status === 'Approved';
      const converted = r.status === 'Converted';
      const at = toMillis(r.decisionAt ?? r.createdAt);
      const when = at
        ? new Date(at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          })
        : '';

      const label = converted
        ? 'Tenant account created'
        : approved
          ? 'Reservation approved'
          : `Reservation ${escapeHtml(String(r.status).toLowerCase())}`;

      const tone =
        converted || approved ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600';

      return `
        <div class="flex items-start gap-3 pb-4 border-b">
          <div class="w-8 h-8 ${tone} rounded-full flex items-center justify-center shrink-0">
            <span class="text-sm font-bold">${converted ? 'U' : approved ? '✓' : '✕'}</span>
          </div>
          <div class="min-w-0">
            <p class="text-sm font-medium">${escapeHtml(label)}</p>
            <p class="text-xs text-gray-500 truncate">
              ${escapeHtml(r.name || 'Guest')}${r.room ? ` · ${escapeHtml(r.room)}` : ''}${when ? ` · ${escapeHtml(when)}` : ''}
            </p>
          </div>
        </div>`;
    })
    .join('');
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Subscribes to the `rooms` collection.
 * @returns {(() => void)|null}
 */
export function listenToRooms() {
  if (!window.firebaseDb || !window.firebaseFirestore) return null;

  const { collection, query, orderBy, onSnapshot } = window.firebaseFirestore;

  try {
    return onSnapshot(
      query(collection(window.firebaseDb, 'rooms'), orderBy('name', 'asc')),
      (snapshot) => {
        renderRooms(
          snapshot.docs.map((doc) => {
            const data = doc.data();
            const capacity = Number(data.capacity);
            return {
              id: doc.id,
              name: data.name || doc.id,
              available: clampAvailability(data.available),
              capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null
            };
          })
        );
      },
      (error) => {
        console.warn('Rooms watcher unavailable:', error?.code || error?.message);
      }
    );
  } catch (error) {
    console.warn('Could not subscribe to rooms:', error?.message);
    return null;
  }
}

/**
 * Applies a stepper change to one room.
 *
 * Clamps before writing so a room can never be stored with a negative or
 * fractional count, and respects a stored capacity ceiling.
 *
 * @param {string} roomName
 * @param {number} delta
 */
export async function adjustAvailability(roomName, delta) {
  const room = rooms.find((r) => r.name === roomName);
  if (!room) return false;

  const next = clampAvailability(room.available + delta, room.capacity ?? undefined);
  if (next === room.available) {
    Toast.error(
      room.capacity !== null && next >= room.capacity
        ? `${room.name} is already at capacity.`
        : `${room.name} is already at 0.`
    );
    return false;
  }

  const ok = await setRoomAvailability(roomName, next);
  if (!ok) Toast.error(`Could not update ${room.name}.`);
  return ok;
}

/**
 * Wires the stepper buttons. Delegated, so no inline handlers are needed.
 */
export function initRoomControls() {
  document.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element ? event.target.closest('button[data-action]') : null;
    if (!button) return;

    const { action, room } = button.dataset;
    if (action === 'room-inc') adjustAvailability(room, 1);
    else if (action === 'room-dec') adjustAvailability(room, -1);
  });
}
