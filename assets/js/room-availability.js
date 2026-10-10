/**
 * Room availability.
 *
 * This used to be defined TWICE -- once in main.js and once in
 * property-detail.js -- both assigned to `window.setRoomAvailability`. Both
 * files are loaded by property-detail.html, so whichever loaded last silently
 * won. There is now exactly one implementation, and callers that want a
 * context-specific default pass `fallbackRoomName`.
 */

import {
  firebaseFirestore,
  getRoomDocRef,
  isFirestoreReady,
  waitForFirebaseReady
} from './firebase-service.js';

const DEFAULT_ROOM = 'Triple Occupancy Room';

/**
 * Sets a room's available count in Firestore.
 *
 * Accepts either a count, or a room name plus a count:
 *   setRoomAvailability(3)
 *   setRoomAvailability('Commercial Space', 1)
 *
 * @param {number|string} roomNameOrCount
 * @param {number} [maybeCount]
 * @param {Object} [options]
 * @param {string} [options.fallbackRoomName] - used when no name is supplied
 * @returns {Promise<boolean>} whether the write succeeded
 */
export async function setRoomAvailability(roomNameOrCount, maybeCount, options = {}) {
  let roomName = options.fallbackRoomName || DEFAULT_ROOM;
  let count = roomNameOrCount;

  if (typeof roomNameOrCount === 'string') {
    roomName = roomNameOrCount;
    count = maybeCount;
  }

  if (typeof count !== 'number') {
    count = parseInt(count, 10);
  }

  if (isNaN(count)) {
    console.error(
      'Invalid count. Usage: setRoomAvailability(3) or setRoomAvailability("Triple Occupancy Room", 3)'
    );
    return false;
  }

  await waitForFirebaseReady();
  if (!isFirestoreReady()) {
    console.error('Firestore not initialized');
    return false;
  }

  const roomRef = getRoomDocRef(roomName);
  if (!roomRef) {
    console.error('Room ref not found for:', roomName);
    return false;
  }

  await firebaseFirestore.setDoc(roomRef, { name: roomName, available: count }, { merge: true });

  console.log(`Updated "${roomName}" availability to ${count} rooms.`);
  return true;
}

/**
 * Decrements a room's availability, used when a reservation is approved.
 *
 * @param {string} roomName
 * @returns {Promise<void>}
 */
export async function decrementRoomAvailability(roomName) {
  if (!isFirestoreReady() || !roomName) return;

  try {
    await waitForFirebaseReady();
    const roomRef = getRoomDocRef(roomName);
    if (!roomRef) return;

    const snap = await firebaseFirestore.getDoc(roomRef);
    if (!snap.exists()) return;

    const current = Number(snap.data().available ?? 0);
    const next = Math.max(0, current - 1);
    await firebaseFirestore.setDoc(roomRef, { available: next }, { merge: true });
    console.log(`Decremented "${roomName}" availability ${current} -> ${next}`);
  } catch (error) {
    console.error('Failed to decrement room availability:', error);
  }
}
