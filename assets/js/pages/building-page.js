/**
 * Public 3D building tour (building.html).
 *
 * Deliberately detail-free. The admin dashboard shows which specific units are
 * occupied and who lives in them; this page shows the same building geometry
 * with occupancy suppressed, so a visitor cannot work out which apartments in
 * the building are empty. That is a real safety consideration for a
 * residential property, so the distinction is enforced here with
 * `showOccupancy: false` rather than left to the UI.
 *
 * Reads `units` (public) but never `tenants` (staff-only), so there is nothing
 * here to leak even if the rules were loosened later.
 */

import '../firebase-service.js';
import { createBuildingViewer } from '../lib/building-viewer.js';
import { normalizeUnit } from '../lib/units.js';

let viewer = null;

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function initPublicBuilding() {
  const host = document.getElementById('buildingViewer');
  if (!host) return;

  try {
    viewer = await createBuildingViewer(host, {
      // No occupancy colours, no hover tooltips: nothing to scrape.
      showOccupancy: false
    });
  } catch (error) {
    console.error('Public building viewer failed to start:', error);
    host.innerHTML =
      '<p class="text-sm text-gray-500 p-6">The 3D view could not load. It needs WebGL and an internet connection for the Three.js CDN.</p>';
    return;
  }

  document.getElementById('buildingXrayToggle')?.addEventListener('change', (event) => {
    viewer?.setXray(event.target.checked);
  });

  // units is world-readable; tenants/reservations are not queried at all.
  const { collection, onSnapshot } = window.firebaseFirestore;
  const unitsRef = collection(window.firebaseDb, 'units');

  onSnapshot(
    unitsRef,
    (snapshot) => {
      const units = snapshot.docs.map((doc) => normalizeUnit(doc.data(), doc.id));
      viewer?.setUnits(units, {});
      setText('buildingUnitCount', `${units.length} units`);
      const floors = new Set(units.map((u) => u.floor));
      setText('buildingFloorCount', `${floors.size} floor${floors.size === 1 ? '' : 's'}`);
    },
    (error) => {
      console.warn('Units unavailable:', error?.code || error?.message);
      setText('buildingUnitCount', 'unavailable');
    }
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPublicBuilding);
} else {
  initPublicBuilding();
}
