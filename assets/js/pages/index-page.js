/**
 * Public landing page: live room-availability badges.
 *
 * Previously part of main.js, which meant index.html and every admin page both
 * ran this initialiser even though the badges exist on only one page.
 */

import {
  firebaseFirestore,
  getRoomDocRef,
  isFirestoreReady,
  waitForFirebaseReady
} from '../firebase-service.js';

const ROOMS = [
  { name: 'Triple Occupancy Room', badgeId: 'tripleAvailabilityBadge', defaultAvailable: 3 },
  { name: 'Commercial Space', badgeId: 'commercialAvailabilityBadge', defaultAvailable: 1 }
];

function renderBadge(badgeElement, availableCount) {
  if (!badgeElement) return;
  // The count is a number from Firestore, so interpolation is safe here.
  badgeElement.innerHTML = `
    <span class="w-2 h-2 bg-white rounded-full animate-ping absolute"></span>
    <span class="w-2 h-2 bg-white rounded-full relative"></span>
    ${availableCount} Available
  `;
}

/**
 * Creates each room document on first read, then subscribes to live updates.
 * @returns {Promise<boolean>} whether the badges were wired up
 */
export async function initRoomAvailabilityBadges() {
  await waitForFirebaseReady();
  if (!isFirestoreReady()) return false;

  let wired = false;

  for (const { name, badgeId, defaultAvailable } of ROOMS) {
    const badge = document.getElementById(badgeId);
    if (!badge) continue;

    const roomRef = getRoomDocRef(name);
    if (!roomRef) continue;

    try {
      let snap = await firebaseFirestore.getDoc(roomRef);
      if (!snap.exists()) {
        await firebaseFirestore.setDoc(roomRef, { name, available: defaultAvailable });
        snap = await firebaseFirestore.getDoc(roomRef);
      }

      if (snap.exists()) {
        const { available } = snap.data();
        if (typeof available === 'number') renderBadge(badge, available);
      }

      firebaseFirestore.onSnapshot(
        roomRef,
        (snapshot) => {
          if (!snapshot.exists()) return;
          const { available } = snapshot.data();
          if (typeof available === 'number') renderBadge(badge, available);
        },
        (error) => console.error('Room badge subscription failed:', name, error)
      );

      wired = true;
    } catch (error) {
      console.error('Failed to set up room availability badge:', name, error);
    }
  }

  return wired;
}
