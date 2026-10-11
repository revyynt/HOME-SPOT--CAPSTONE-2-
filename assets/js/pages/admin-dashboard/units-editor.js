/**
 * Create building units from the admin dashboard.
 *
 * Replaces the copy-an-ID-token-into-a-terminal flow for the common case. The
 * browser is already signed in, so writes go through the Firestore Web SDK with
 * that session -- there is no token to copy, paste, leak into a chat, or let
 * expire.
 *
 * firestore.rules already grants `allow write: if isAdmin()` on `units`, so this
 * needs no rule change; if the signed-in account is not staff, the write is
 * simply refused and we say so.
 *
 * `seed-units.js` remains for bulk/offline seeding; `check-auth.js` diagnoses a
 * token when one is genuinely needed.
 */

import { escapeHtml } from '../../lib/format.js';
import { Toast } from '../../render/toast.js';

const MAX_FLOORS = 20;
const MAX_PER_FLOOR = 20;

/**
 * Builds the units for a shape. Pure so the shape maths is testable.
 *
 * Floor numbering starts at 1 and a unit number is the floor followed by a
 * two-digit position: floor 2, position 3 -> "203".
 *
 * @param {number} floors
 * @param {number} perFloor
 * @param {string} [type]
 * @returns {Array<{id: string, number: string, floor: number, type: string, order: number}>}
 */
export function buildUnits(floors, perFloor, type = 'triple-occupancy-room') {
  const f = Math.max(1, Math.min(MAX_FLOORS, Math.floor(Number(floors) || 0)));
  const p = Math.max(1, Math.min(MAX_PER_FLOOR, Math.floor(Number(perFloor) || 0)));

  const units = [];
  for (let floor = 1; floor <= f; floor++) {
    for (let slot = 1; slot <= p; slot++) {
      const number = `${floor}${String(slot).padStart(2, '0')}`;
      units.push({ id: number, number, floor, type, order: slot - 1 });
    }
  }
  return units;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showPreview(units) {
  const box = document.getElementById('unitsPreview');
  if (!box) return;

  if (!units.length) {
    box.innerHTML = '<p class="text-sm text-gray-500">Enter a shape to preview.</p>';
    return;
  }

  box.innerHTML =
    `<p class="text-xs text-gray-600 mb-2">${units.length} units would be written:</p>` +
    `<div class="max-h-40 overflow-y-auto text-xs font-mono text-gray-700 space-y-0.5">` +
    units.map((u) => `<div>${escapeHtml(u.number)} &nbsp;floor ${u.floor}</div>`).join('') +
    `</div>`;
}

/**
 * Writes the units, upserting each one.
 *
 * @param {Array<Object>} units
 * @returns {Promise<boolean>}
 */
export async function createUnits(units) {
  if (!Array.isArray(units) || !units.length) return false;
  if (!window.firebaseDb || !window.firebaseFirestore) {
    Toast.error('Firestore is not available.');
    return false;
  }

  const { doc, setDoc, serverTimestamp } = window.firebaseFirestore;
  let written = 0;

  try {
    for (const unit of units) {
      await setDoc(
        doc(window.firebaseDb, 'units', unit.id),
        {
          number: unit.number,
          floor: unit.floor,
          type: unit.type,
          order: unit.order,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      written++;
    }
  } catch (error) {
    console.error('Unit creation failed:', error);
    const hint =
      error?.code === 'permission-denied'
        ? 'Your account is not allowed to write units. Check that users/{uid}.role is admin or superadmin.'
        : 'Check your connection and try again.';
    Toast.error(`Wrote ${written} of ${units.length} units. ${hint}`);
    return false;
  }

  Toast.success(`Created ${written} units.`);
  return true;
}

/**
 * Wires the "Add Units" panel.
 */
export function initUnitsEditor() {
  const openBtn = document.getElementById('openUnitsEditor');
  const panel = document.getElementById('unitsEditorPanel');
  const floorsInput = document.getElementById('unitsFloors');
  const perFloorInput = document.getElementById('unitsPerFloor');
  const createBtn = document.getElementById('unitsCreateBtn');
  const closeBtn = document.getElementById('unitsEditorClose');

  if (!panel || !floorsInput || !perFloorInput) return;

  const refresh = () => showPreview(buildUnits(floorsInput.value, perFloorInput.value));

  const toggle = (open) => {
    panel.classList.toggle('hidden', !open);
    if (open) refresh();
  };

  openBtn?.addEventListener('click', () => toggle(true));
  closeBtn?.addEventListener('click', () => toggle(false));

  floorsInput.addEventListener('input', refresh);
  perFloorInput.addEventListener('input', refresh);

  createBtn?.addEventListener('click', async () => {
    const units = buildUnits(floorsInput.value, perFloorInput.value);
    if (!units.length) return;

    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';

    const ok = await createUnits(units);

    createBtn.disabled = false;
    createBtn.textContent = 'Create Units';

    if (ok) {
      toggle(false);
      setText('buildingUnitCountHint', '');
    }
  });
}
