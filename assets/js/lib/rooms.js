/**
 * Room identity helpers.
 *
 * Room documents live in Firestore under a slug derived from the display name.
 * This was previously duplicated in firebase-service.js, main.js, and
 * property-detail.js; this module is the single source of truth.
 */

/**
 * Converts a room display name into its Firestore document id.
 *
 *   "Triple Occupancy Room" -> "triple-occupancy-room"
 *   "Commercial Space"      -> "commercial-space"
 *
 * @param {string} name
 * @returns {string}
 */
export function normalizeRoomDocId(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Known rooms and their aliases, used by the CLI and the detail page to resolve
 * a user-supplied room name to a document id.
 */
export const ROOM_ALIASES = {
  triple: { id: 'triple-occupancy-room', name: 'Triple Occupancy Room' },
  'triple occupancy': { id: 'triple-occupancy-room', name: 'Triple Occupancy Room' },
  'triple occupancy room': { id: 'triple-occupancy-room', name: 'Triple Occupancy Room' },
  commercial: { id: 'commercial-space', name: 'Commercial Space' },
  'commercial space': { id: 'commercial-space', name: 'Commercial Space' }
};

/**
 * Resolves a loose room key ("triple", "commercial space") to a canonical
 * room, falling back to slugifying the input.
 *
 * @param {string} key
 * @returns {{id: string, name: string}}
 */
export function resolveRoom(key) {
  const normalized = String(key || '')
    .trim()
    .toLowerCase();
  if (ROOM_ALIASES[normalized]) return { ...ROOM_ALIASES[normalized] };
  return { id: normalizeRoomDocId(normalized), name: String(key || '') };
}
