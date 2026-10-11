/**
 * Unit (individual room) model and 3D layout maths.
 *
 * A "unit" is one physical room -- "201", "105" -- as opposed to a room *type*
 * ("Triple Occupancy Room"). Occupancy is NEVER stored on a unit: a publicly
 * readable doc holding "is this flat empty" would let anyone scrape which
 * apartments in the building are vacant. Instead it is derived at runtime from
 * `tenants` and `reservations`, which firestore.rules already restricts to
 * staff and the tenant themself.
 *
 * Everything here is pure so `node --test` can prove the geometry maths -- the
 * viewer only has to turn these numbers into meshes.
 */

/** Unit occupancy states, in increasing "settledness". */
export const UNIT_STATE = {
  AVAILABLE: 'Available',
  PENDING: 'Pending',
  BOOKED: 'Booked'
};

/** Default geometry constants, in arbitrary scene units. */
export const LAYOUT_DEFAULTS = {
  floorHeight: 3,
  unitWidth: 3,
  unitDepth: 3,
  corridorWidth: 2,
  gap: 0.4
};

/**
 * Normalises a unit document into the shape the viewer relies on.
 *
 * Tolerates missing/odd fields so a hand-entered Firestore doc cannot break the
 * whole building.
 *
 * @param {Object} doc - the raw Firestore document data
 * @param {string} [id] - the document id (usually the unit number)
 * @returns {{id: string, number: string, floor: number, type: string, order: number}}
 */
export function normalizeUnit(doc, id) {
  const data = doc && typeof doc === 'object' ? doc : {};

  const number = String(data.number ?? id ?? '').trim();

  // Floors are 1-based in the real world; coerce junk to 1 rather than NaN so a
  // bad row still renders (in the wrong place) instead of vanishing.
  const parsedFloor = Number(data.floor);
  const floor = Number.isFinite(parsedFloor) && parsedFloor >= 1 ? Math.floor(parsedFloor) : 1;

  const parsedOrder = Number(data.order);
  const order = Number.isFinite(parsedOrder) ? parsedOrder : 0;

  return {
    id: String(data.id ?? id ?? number).trim(),
    number: number || '—',
    floor,
    type: String(data.type ?? '').trim(),
    order
  };
}

/**
 * Groups units by floor, sorted ascending, with units ordered within each floor.
 *
 * @param {Array<Object>} units - normalized units
 * @returns {Array<{floor: number, units: Array<Object>}>}
 */
export function groupByFloor(units) {
  const list = Array.isArray(units) ? units.filter(Boolean) : [];

  const byFloor = new Map();
  for (const unit of list) {
    if (!byFloor.has(unit.floor)) byFloor.set(unit.floor, []);
    byFloor.get(unit.floor).push(unit);
  }

  return [...byFloor.entries()]
    .map(([floor, floorUnits]) => ({
      floor,
      // `order` first, then the unit number so output is stable and testable.
      units: [...floorUnits].sort((a, b) => a.order - b.order || a.number.localeCompare(b.number))
    }))
    .sort((a, b) => a.floor - b.floor);
}

/**
 * Computes the 3D position for every unit.
 *
 * Floors stack upward along Y; units spread along X on each floor, centred
 * around the origin so the building stays balanced as units are added.
 *
 * @param {Array<Object>} units - normalized units
 * @param {Object} [options]
 * @returns {Array<Object>} units annotated with `position` {x,y,z} and `size`
 */
export function layoutUnits(units, options = {}) {
  const cfg = { ...LAYOUT_DEFAULTS, ...options };
  const floors = groupByFloor(units);

  const out = [];

  for (const { floor, units: floorUnits } of floors) {
    const floorCount = floorUnits.length;
    const thisSpan = floorCount * (cfg.unitWidth + cfg.gap) - cfg.gap;

    floorUnits.forEach((unit, index) => {
      // Left-align within this floor, then offset so the floor is centred.
      const leftEdge = -(thisSpan / 2);
      const x = leftEdge + index * (cfg.unitWidth + cfg.gap) + cfg.unitWidth / 2;

      out.push({
        ...unit,
        position: {
          x,
          y: (floor - 1) * cfg.floorHeight,
          z: -cfg.corridorWidth / 2
        },
        size: { width: cfg.unitWidth, height: cfg.floorHeight * 0.8, depth: cfg.unitDepth }
      });
    });
  }

  return out;
}

/**
 * Works out how many distinct floors a set of units occupies, and the overall
 * height of the building.
 *
 * @param {Array<Object>} units
 * @param {Object} [options]
 * @returns {{floors: number, height: number}}
 */
export function buildingBounds(units, options = {}) {
  const cfg = { ...LAYOUT_DEFAULTS, ...options };
  const list = Array.isArray(units) ? units.filter(Boolean) : [];
  if (!list.length) return { floors: 0, height: 0 };

  const maxFloor = list.reduce((max, u) => Math.max(max, u.floor), 1);
  return { floors: maxFloor, height: maxFloor * cfg.floorHeight };
}

/**
 * Determines a unit's occupancy.
 *
 * Priority:
 *   1. an assigned tenant      -> Booked
 *   2. an approved/converted   -> Pending  (reserved, tenant not onboarded yet)
 *      or pending reservation
 *   3. otherwise               -> Available
 *
 * @param {string} unitId
 * @param {Object} context
 * @param {Set<string>|Array<string>} [context.tenantUnitIds]
 * @param {Set<string>|Array<string>} [context.pendingUnitIds]
 * @returns {string} one of UNIT_STATE
 */
export function deriveUnitState(unitId, { tenantUnitIds, pendingUnitIds } = {}) {
  const id = String(unitId ?? '').trim();
  if (!id) return UNIT_STATE.AVAILABLE;

  if (asSet(tenantUnitIds).has(id)) return UNIT_STATE.BOOKED;
  if (asSet(pendingUnitIds).has(id)) return UNIT_STATE.PENDING;
  return UNIT_STATE.AVAILABLE;
}

/** Accepts a Set or Array and always returns a Set. */
function asSet(value) {
  if (!value) return new Set();
  return value instanceof Set ? value : new Set(value.filter(Boolean).map(String));
}

/**
 * Colour per state, as hex numbers ready for THREE.Color.
 *
 * Red = taken, amber = being onboarded, teal = free.
 */
export const STATE_COLORS = {
  [UNIT_STATE.AVAILABLE]: 0x2dd4bf,
  [UNIT_STATE.PENDING]: 0xf59e0b,
  [UNIT_STATE.BOOKED]: 0xef4444
};

/**
 * The display colour for a state.
 * @param {string} state
 * @returns {number} hex; unknown states fall back to the "available" colour
 */
export function stateColor(state) {
  return STATE_COLORS[state] ?? STATE_COLORS[UNIT_STATE.AVAILABLE];
}

/**
 * Whether a state should glow (emissive) in the viewer.
 * @param {string} state
 */
export function shouldEmissive(state) {
  return state === UNIT_STATE.BOOKED || state === UNIT_STATE.PENDING;
}

/**
 * Derives the per-unit state for a whole building in one pass.
 *
 * @param {Array<Object>} units - normalized units
 * @param {Object} context - as deriveUnitState
 * @returns {Array<{unit: Object, state: string, color: number}>}
 */
export function buildUnitStates(units, context = {}) {
  const list = Array.isArray(units) ? units.filter(Boolean) : [];
  return list.map((unit) => {
    const state = deriveUnitState(unit.id, context);
    return { unit, state, color: stateColor(state) };
  });
}
