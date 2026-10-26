import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  supabaseData,
  getRoomDocRef,
  isDataReady,
  waitForSupabaseReady
} from '../supabase-service.js';

function AvailabilityBadge({ roomName, defaultAvailable }) {
  const [available, setAvailable] = useState(defaultAvailable);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe;

    async function subscribe() {
      await waitForSupabaseReady();
      if (cancelled || !isDataReady()) return;

      const roomRef = getRoomDocRef(roomName);
      if (!roomRef) return;

      try {
        let snapshot = await supabaseData.getDoc(roomRef);
        if (!snapshot.exists()) {
          await supabaseData.setDoc(roomRef, { name: roomName, available: defaultAvailable });
          snapshot = await supabaseData.getDoc(roomRef);
        }

        if (cancelled) return;
        if (snapshot.exists() && typeof snapshot.data().available === 'number') {
          setAvailable(snapshot.data().available);
        }

        unsubscribe = supabaseData.onSnapshot(
          roomRef,
          (nextSnapshot) => {
            if (!nextSnapshot.exists()) return;
            const count = nextSnapshot.data().available;
            if (typeof count === 'number') setAvailable(count);
          },
          (error) => console.error('Room badge subscription failed:', roomName, error)
        );
      } catch (error) {
        console.error('Failed to set up room availability badge:', roomName, error);
      }
    }

    subscribe();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [defaultAvailable, roomName]);

  return (
    <span className="pulse-badge bg-gradient-to-r from-green-500 to-green-600 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg flex items-center gap-1.5">
      <span className="w-2 h-2 bg-white rounded-full"></span>
      {available} Available
    </span>
  );
}

document.querySelectorAll('[data-availability-room]').forEach((container) => {
  const root = createRoot(container);
  root.render(
    <AvailabilityBadge
      roomName={container.dataset.availabilityRoom}
      defaultAvailable={Number(container.dataset.defaultAvailable)}
    />
  );
});
