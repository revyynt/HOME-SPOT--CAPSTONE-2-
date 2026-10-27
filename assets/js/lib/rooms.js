/**
 * Room identity helpers.
 *
 * Room documents live in app_documents under a slug derived from the display name.
 * This was previously duplicated in the data service, main.js, and
 * property-detail.js; this module is the single source of truth.
 */

/**
 * Converts a room display name into its document id.
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

/**
 * Canonical default room catalog used as fallback and initial seed.
 */
export const DEFAULT_ROOMS = [
  {
    id: 'triple-occupancy-room',
    detailId: 1,
    name: 'Triple Occupancy Room',
    type: 'Living Space',
    badge: 'Most Popular',
    price: 10000,
    beds: 1,
    capacity: 3,
    available: 3,
    size: '30 sqm',
    image: 'assets/img/triple-occupancy-panorama.png',
    mainImage: 'assets/img/triple-occupancy.jpg',
    panorama: 'assets/img/triple-occupancy-panorama.png',
    images: ['assets/img/triple-occupancy.jpg', 'assets/img/triple-occupancy-panorama.png'],
    description:
      'Spacious apartment unit that can accommodate up to 3 people. Perfect for small families or groups of students looking for a comfortable shared living space.',
    features: ['3 People', 'Bathroom', 'Aircon Space']
  },
  {
    id: 'commercial-space',
    detailId: 4,
    name: 'Commercial Space',
    type: 'Space for Business Operations',
    badge: 'Premium',
    price: 12000,
    beds: 0,
    capacity: 4,
    available: 1,
    size: '35 sqm',
    image: 'assets/img/commercial-space.jpg',
    mainImage: 'assets/img/commercial-space.jpg',
    panorama: 'assets/img/commercial-space-panorama.png',
    images: ['assets/img/commercial-space.jpg', 'assets/img/commercial-space-panorama.png'],
    description:
      'Premium commercial space ideal for business operations. Spacious unit suitable for small offices, retail, or service-based businesses with comfortable working capacity.',
    features: ['4 People', 'Bathroom']
  }
];

/**
 * Formats a numeric or string room price (e.g. 10000 -> "₱10,000" or "₱10,000/month").
 *
 * @param {number|string} price
 * @param {boolean} [withSuffix=false]
 * @returns {string}
 */
export function formatRoomPrice(price, withSuffix = false) {
  const raw = String(price ?? '')
    .replace(/[₱,\s]/g, '')
    .replace(/\/month$/i, '');
  const num = Number(raw);
  if (Number.isFinite(num) && raw !== '') {
    const formatted = `₱${num.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
    return withSuffix ? `${formatted}/month` : formatted;
  }
  const str = String(price ?? '').trim();
  if (!str) return withSuffix ? '₱0/month' : '₱0';
  return withSuffix && !str.endsWith('/month') ? `${str}/month` : str.replace(/\/month$/i, '');
}

/**
 * Merges remote Supabase room document fields over a base room definition.
 *
 * @param {string|number|Object} baseOrKey
 * @param {Object} [remote]
 * @returns {Object}
 */
export function mergeRoomData(baseOrKey, remote = {}) {
  const base =
    typeof baseOrKey === 'object' && baseOrKey !== null
      ? baseOrKey
      : DEFAULT_ROOMS.find(
        (r) =>
          r.id === baseOrKey ||
          r.detailId === Number(baseOrKey) ||
          r.id === normalizeRoomDocId(baseOrKey)
      ) || {
        id: typeof baseOrKey === 'string' ? normalizeRoomDocId(baseOrKey) : 'triple-occupancy-room',
        detailId: Number(baseOrKey) || 1,
        name: typeof baseOrKey === 'string' ? baseOrKey : 'Apartment Unit',
        type: 'Living Space',
        badge: '',
        price: 10000,
        beds: 1,
        capacity: 2,
        available: 1,
        size: '25 sqm',
        image: 'assets/img/triple-occupancy-panorama.png',
        mainImage: 'assets/img/triple-occupancy.jpg',
        panorama: 'assets/img/triple-occupancy-panorama.png',
        images: ['assets/img/triple-occupancy.jpg'],
        description: 'Comfortable apartment unit living space.',
        features: ['1 Room', 'Bathroom']
      };

  const data = remote || {};
  const features = Array.isArray(data.features)
    ? data.features.filter(Boolean)
    : typeof data.features === 'string' && data.features.trim()
      ? data.features
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      : Array.isArray(data.amenities) && data.amenities.length > 0
        ? data.amenities
        : base.features;

  const images = Array.isArray(data.images)
    ? data.images.map((s) => String(s).trim()).filter(Boolean)
    : typeof data.images === 'string'
      ? data.images
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      : Array.isArray(base.images)
        ? [...base.images]
        : [data.mainImage || base.mainImage || base.image].filter(Boolean);

  const rawPrice = data.price ?? base.price;
  const numericPrice = Number(
    String(rawPrice)
      .replace(/[₱,\s]/g, '')
      .replace(/\/month$/i, '')
  );

  return {
    ...base,
    id: data.id || base.id || normalizeRoomDocId(data.name || base.name),
    detailId: Number(data.detailId ?? base.detailId ?? 1),
    name: data.name || base.name,
    type: data.type || base.type,
    badge: data.badge ?? base.badge,
    price: Number.isFinite(numericPrice) && String(rawPrice) !== '' ? numericPrice : base.price,
    available:
      typeof data.available === 'number'
        ? data.available
        : Number.isFinite(Number(data.available)) && data.available !== '' && data.available != null
          ? Number(data.available)
          : base.available,
    capacity:
      typeof data.capacity === 'number'
        ? data.capacity
        : Number.isFinite(Number(data.capacity)) && data.capacity !== '' && data.capacity != null
          ? Number(data.capacity)
          : base.capacity,
    size: data.size || base.size,
    image: data.image || base.image,
    mainImage: data.mainImage || data.image || base.mainImage,
    panorama: data.panorama || base.panorama,
    images,
    description: data.description || base.description,
    features
  };
}
