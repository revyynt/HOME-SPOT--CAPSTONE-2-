/**
 * 3D X-Ray Building Viewer for MJP Residences (Home-Spot).
 *
 * Reconstructs the stepped 5-story front + 3-story rear (with 4F Back Deck)
 * concrete building from the street elevation, interior hallway, and satellite
 * reference photos:
 *   - 1st Floor (Full Footprint, z = +8.0 .. -8.0):
 *       • Left Bay: Owner's "MJ Parungao Purified Water Station" (non-rentable).
 *       • Center-Right Bay (under white canopy with angled struts): "Commercial Space 1".
 *       • Right Bay: Gated tiled hallway running back to the staircase at the end
 *         of the main hallway (z = -0.5 .. -3.8).
 *   - 2nd Floor (Full Footprint, z = +8.0 .. -8.0):
 *       • 3 Triple Occupancy Rooms: Room 101 (Front), Room 102 (Middle), Room 103 (Rear)
 *       • Right-side chevron-tiled hallway, red fire hose cabinet, room doors,
 *         sliding windows, and staircase at the end of the main hallway.
 *   - 3rd Floor (Full Footprint, z = +8.0 .. -8.0):
 *       • 3 Triple Occupancy Rooms: Room 201 (Front), Room 202 (Middle), Room 203 (Rear)
 *       • Right-side tiled hallway with the two horizontal multi-pane right-wall
 *         windows visible from the street, red fire hose cabinet, and staircase.
 *   - 4th Floor (Stepped Massing — Front Indoor Block + Rear Open Back Deck):
 *       • Front Block (z = +8.0 .. -0.4): Double-bay recessed front balcony +
 *         Room 301 (Front Balcony Suite) & Room 302 (Middle Room) + side hallway & stairs.
 *       • Rear Block (z = -0.4 .. -8.0): Stepped-down Open Back Deck (Rear Roof Deck)
 *         enclosed by a parapet wall, with the stairwell bulkhead/penthouse, vertical
 *         red standpipe, and cylindrical stainless steel water tank on the back-right!
 *   - 5th Floor (Front Upper Block Only, z = +8.0 .. -0.4):
 *       • 3 protruding white box-framed front windows + upper right-wall square window +
 *         Room 401 (Front Upper Room) & Room 410 (Middle Upper Room) + upper roof slab.
 */

export const BUILDING_UNITS = [
  {
    id: 'Commercial Space 1',
    name: 'Commercial Space 1',
    aliases: ['commercial space 1', 'commercial space', 'commercial', 'unit-1f-commercial', 'hezekiah'],
    listingId: 'commercial-space',
    floor: 1,
    floorLabel: '1st Floor (Ground)',
    wing: 'Front Right Storefront (Under Canopy)',
    positionLabel: '1st Floor • Front Center-Right Storefront',
    type: 'Commercial Space',
    size: '35 sqm',
    capacity: 4,
    price: 12000,
    description:
      "1st Floor center-right storefront under the white canopy overhang — separated from the owner's MJ Parungao Purified Water Station on the left and the gated side hallway on the right.",
    features: [
      'Dedicated Canopy & Glass Storefront',
      'Beside Owner Water Station',
      'Private Comfort Room',
      'Street-Front Retail / Office Ready'
    ],
    bounds: { x: 0.25, y: 1.5, z: 1.2, w: 3.5, h: 2.6, d: 12.6 }
  },
  {
    id: 'Room 101',
    name: 'Room 101',
    aliases: ['room 101', '101', 'unit-2f-1', '2f front'],
    listingId: 'triple-occupancy-room',
    floor: 2,
    floorLabel: '2nd Floor',
    wing: 'Front Wing (Street Side)',
    positionLabel: '2nd Floor • Front Unit (Street Side)',
    type: 'Triple Occupancy Room',
    size: '30 sqm',
    capacity: 3,
    price: 10000,
    features: [
      '3 Beds (Triple Occupancy)',
      'Private Bathroom',
      'Aircon Provision',
      '2 Front Box Windows + Hallway Sliding Window'
    ],
    bounds: { x: -1.65, y: 4.7, z: 5.0, w: 7.2, h: 2.6, d: 4.5 }
  },
  {
    id: 'Room 102',
    name: 'Room 102',
    aliases: ['room 102', '102', 'room 105', '105', 'unit-2f-2', '2f middle'],
    listingId: 'triple-occupancy-room',
    floor: 2,
    floorLabel: '2nd Floor',
    wing: 'Middle Wing',
    positionLabel: '2nd Floor • Middle Unit',
    type: 'Triple Occupancy Room',
    size: '30 sqm',
    capacity: 3,
    price: 10000,
    features: [
      '3 Beds (Triple Occupancy)',
      'Private Bathroom',
      'Aircon Provision',
      'Hallway Sliding Window & Door'
    ],
    bounds: { x: -1.65, y: 4.7, z: -0.4, w: 7.2, h: 2.6, d: 4.5 }
  },
  {
    id: 'Room 103',
    name: 'Room 103',
    aliases: ['room 103', '103', 'unit-2f-3', '2f rear'],
    listingId: 'triple-occupancy-room',
    floor: 2,
    floorLabel: '2nd Floor',
    wing: 'Rear Wing (Under Back Deck)',
    positionLabel: '2nd Floor • Rear Unit',
    type: 'Triple Occupancy Room',
    size: '30 sqm',
    capacity: 3,
    price: 10000,
    features: [
      '3 Beds (Triple Occupancy)',
      'Private Bathroom',
      'Aircon Provision',
      'Adjacent to Hallway Staircase'
    ],
    bounds: { x: -1.65, y: 4.7, z: -5.8, w: 7.2, h: 2.6, d: 4.5 }
  },
  {
    id: 'Room 201',
    name: 'Room 201',
    aliases: ['room 201', '201', 'unit-3f-1', '3f front'],
    listingId: 'triple-occupancy-room',
    floor: 3,
    floorLabel: '3rd Floor',
    wing: 'Front Wing (Street Side)',
    positionLabel: '3rd Floor • Front Unit (Street Side)',
    type: 'Triple Occupancy Room',
    size: '30 sqm',
    capacity: 3,
    price: 10000,
    features: [
      '3 Beds (Triple Occupancy)',
      'Private Bathroom',
      'Aircon Provision',
      '2 Front Box Windows + Hallway Sliding Window'
    ],
    bounds: { x: -1.65, y: 7.9, z: 5.0, w: 7.2, h: 2.6, d: 4.5 }
  },
  {
    id: 'Room 202',
    name: 'Room 202',
    aliases: ['room 202', '202', 'room 208', '208', 'unit-3f-2', '3f middle'],
    listingId: 'triple-occupancy-room',
    floor: 3,
    floorLabel: '3rd Floor',
    wing: 'Middle Wing',
    positionLabel: '3rd Floor • Middle Unit',
    type: 'Triple Occupancy Room',
    size: '30 sqm',
    capacity: 3,
    price: 10000,
    features: [
      '3 Beds (Triple Occupancy)',
      'Private Bathroom',
      'Aircon Provision',
      'Hallway Sliding Window & Door'
    ],
    bounds: { x: -1.65, y: 7.9, z: -0.4, w: 7.2, h: 2.6, d: 4.5 }
  },
  {
    id: 'Room 203',
    name: 'Room 203',
    aliases: ['room 203', '203', 'unit-3f-3', '3f rear'],
    listingId: 'triple-occupancy-room',
    floor: 3,
    floorLabel: '3rd Floor',
    wing: 'Rear Wing (Below Back Deck)',
    positionLabel: '3rd Floor • Rear Unit',
    type: 'Triple Occupancy Room',
    size: '30 sqm',
    capacity: 3,
    price: 10000,
    features: [
      '3 Beds (Triple Occupancy)',
      'Private Bathroom',
      'Aircon Provision',
      'Adjacent to Hallway Staircase'
    ],
    bounds: { x: -1.65, y: 7.9, z: -5.8, w: 7.2, h: 2.6, d: 4.5 }
  },
  {
    id: 'Room 301',
    name: 'Room 301',
    aliases: ['room 301', '301', 'unit-4f-1', '4f front'],
    listingId: 'triple-occupancy-room',
    floor: 4,
    floorLabel: '4th Floor',
    wing: 'Front Balcony Wing',
    positionLabel: '4th Floor • Front Balcony Unit',
    type: 'Triple Occupancy Room',
    size: '30 sqm',
    capacity: 3,
    price: 10000,
    features: [
      'Double-Bay Front Balcony Access',
      '3 Beds (Triple Occupancy)',
      'Private Bathroom',
      'Aircon & Veranda Downlights'
    ],
    bounds: { x: -1.65, y: 11.1, z: 4.0, w: 7.2, h: 2.6, d: 4.5 }
  },
  {
    id: 'Room 302',
    name: 'Room 302',
    aliases: ['room 302', '302', 'room 303', '303', 'unit-4f-2', '4f middle'],
    listingId: 'triple-occupancy-room',
    floor: 4,
    floorLabel: '4th Floor',
    wing: 'Middle Wing (Beside Back Deck)',
    positionLabel: '4th Floor • Middle Unit (Back Deck Access)',
    type: 'Triple Occupancy Room',
    size: '30 sqm',
    capacity: 3,
    price: 10000,
    features: [
      '3 Beds (Triple Occupancy)',
      'Private Bathroom',
      'Adjacent to 4F Open Back Deck',
      'Hallway Sliding Window'
    ],
    bounds: { x: -1.65, y: 11.1, z: -0.65, w: 7.2, h: 2.6, d: 4.5 }
  },
  {
    id: 'Room 401',
    name: 'Room 401',
    aliases: ['room 401', '401', 'unit-5f-1', '5f front'],
    listingId: 'triple-occupancy-room',
    floor: 5,
    floorLabel: '5th Floor',
    wing: 'Front Wing (Top Facade)',
    positionLabel: '5th Floor • Front Unit (Street View)',
    type: 'Triple Occupancy Room',
    size: '30 sqm',
    capacity: 3,
    price: 10000,
    features: [
      '3 Protruding Front Box Windows',
      '3 Beds (Triple Occupancy)',
      'Private Bathroom',
      'Top-Floor Street View'
    ],
    bounds: { x: -1.65, y: 14.3, z: 4.6, w: 7.2, h: 2.6, d: 4.5 }
  },
  {
    id: 'Room 410',
    name: 'Room 410',
    aliases: ['room 410', '410', 'room 402', '402', 'room 403', '403', 'unit-5f-2', '5f middle'],
    listingId: 'triple-occupancy-room',
    floor: 5,
    floorLabel: '5th Floor',
    wing: 'Upper Middle Wing (Overlooking Back Deck)',
    positionLabel: '5th Floor • Upper Rear-Facing Unit',
    type: 'Triple Occupancy Room',
    size: '30 sqm',
    capacity: 3,
    price: 10000,
    features: [
      '3 Beds (Triple Occupancy)',
      'Private Bathroom',
      'Overlooks 4F Open Back Deck',
      'Hallway Sliding Window'
    ],
    bounds: { x: -1.65, y: 14.3, z: -0.4, w: 7.2, h: 2.6, d: 4.5 }
  }
];

/**
 * Syncs `BUILDING_UNITS` prices, sizes, capacities, descriptions, and features
 * with the live room listings managed in the Admin Listing Dashboard (`rooms` collection).
 * @param {Array<Object>} rooms
 */
export function syncBuildingUnitsWithRooms(rooms = []) {
  if (!Array.isArray(rooms) || !rooms.length) return BUILDING_UNITS;

  const findListing = (unit) => {
    const unitIdNorm = unit.id.toLowerCase();
    const direct = rooms.find(
      (r) =>
        String(r.id || '').toLowerCase() === unitIdNorm ||
        String(r.name || '').toLowerCase() === unitIdNorm
    );
    if (direct) return direct;

    return rooms.find((r) => {
      const rId = String(r.id || '').toLowerCase();
      const rName = String(r.name || '').toLowerCase();
      if (unit.listingId === 'commercial-space') {
        return rId.includes('commercial') || rName.includes('commercial');
      }
      return (
        rId === unit.listingId ||
        rId.includes('triple') ||
        rName.includes('triple')
      );
    });
  };

  BUILDING_UNITS.forEach((unit) => {
    const match = findListing(unit);
    if (!match) return;

    const rawPrice = Number(
      String(match.price ?? '')
        .replace(/[₱,\s]/g, '')
        .replace(/\/month$/i, '')
    );
    if (Number.isFinite(rawPrice) && rawPrice > 0) {
      unit.price = rawPrice;
    }
    if (match.size) {
      unit.size = String(match.size);
    }
    const rawCap = Number(match.capacity);
    if (Number.isFinite(rawCap) && rawCap > 0) {
      unit.capacity = rawCap;
    }
    if (match.name) {
      unit.type = String(match.name);
    }
    if (match.description) {
      unit.description = String(match.description);
    }
    if (Array.isArray(match.features) && match.features.length > 0) {
      unit.listingFeatures = match.features;
    }
  });

  return BUILDING_UNITS;
}

/**
 * Matches a room string (e.g. "Room 201", "Commercial Space 1") to a canonical 3D unit definition.
 * @param {string} roomName
 * @param {string} [dormType]
 */
export function resolveBuildingUnit(roomName, dormType = '') {
  const norm = String(roomName || '').trim().toLowerCase();
  const dormNorm = String(dormType || '').trim().toLowerCase();
  if (norm) {
    const exact = BUILDING_UNITS.find(
      (u) =>
        u.id.toLowerCase() === norm ||
        u.name.toLowerCase() === norm ||
        u.aliases.includes(norm)
    );
    if (exact) return exact;
    const partial = BUILDING_UNITS.find((u) =>
      u.aliases.some((a) => norm.includes(a) || a.includes(norm))
    );
    if (partial) return partial;
  }
  if (dormNorm.includes('commercial')) return BUILDING_UNITS[0];
  return BUILDING_UNITS[4]; // Default Room 201
}

/**
 * Initializes the interactive Three.js 3D X-Ray Building Viewer inside `container`.
 */
export function initBuilding3DViewer(container, options = {}) {
  if (!container) return null;

  container._building3DCleanup?.();
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  container.style.background = 'radial-gradient(circle at 50% 32%, #13213c 0%, #070c18 100%)';
  container.style.cursor = 'grab';

  const state = {
    mode: options.mode || 'tenant',
    highlightRoom: options.tenantRoom || options.highlightRoom || '',
    highlightDorm: options.tenantDorm || options.highlightDorm || '',
    tenants: Array.isArray(options.tenants) ? options.tenants : [],
    isXray: true,
    autoSpin: true,
    activeFloor: 'all',
    selectedUnitId: null
  };

  const initialUnit =
    state.mode === 'tenant'
      ? resolveBuildingUnit(state.highlightRoom, state.highlightDorm)
      : BUILDING_UNITS[4];
  state.selectedUnitId = initialUnit ? initialUnit.id : BUILDING_UNITS[0].id;

  let internalApi = null;

  function setup() {
    const THREE = window.THREE;
    if (!THREE || !container.isConnected) return;

    const W = container.clientWidth || 720;
    const H = container.clientHeight || 520;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x080e1c, 1);
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      touchAction: 'none'
    });
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080e1c, 0.011);

    const camera = new THREE.PerspectiveCamera(40, W / H, 0.5, 260);

    // Rich Architectural Lighting
    scene.add(new THREE.AmbientLight(0xdbeafe, 0.88));
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.95);
    sunLight.position.set(24, 38, 30);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.5);
    rimLight.position.set(-26, 20, -22);
    scene.add(rimLight);

    // Ground Blueprint Grid & Street Apron
    const grid = new THREE.GridHelper(46, 46, 0x1e3a8a, 0x112040);
    grid.position.y = -0.06;
    scene.add(grid);

    const streetGeo = new THREE.BoxGeometry(15.0, 0.14, 3.8);
    const streetMat = new THREE.MeshLambertMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.72
    });
    const streetMesh = new THREE.Mesh(streetGeo, streetMat);
    streetMesh.position.set(0, 0.01, 10.1);
    scene.add(streetMesh);

    const buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    const floorGroups = {
      1: new THREE.Group(),
      2: new THREE.Group(),
      3: new THREE.Group(),
      4: new THREE.Group(),
      5: new THREE.Group(),
      6: new THREE.Group() // Upper 5F roof cornice
    };
    Object.values(floorGroups).forEach((g) => buildingGroup.add(g));

    const shellMeshes = [];
    const shellEdgeLines = [];
    const unitMeshMap = new Map();
    const pickableMeshes = [];

    const createShellMat = (hexColor, xrayOpacity = 0.14, solidOpacity = 0.95) => {
      const mat = new THREE.MeshLambertMaterial({
        color: hexColor,
        transparent: true,
        opacity: state.isXray ? xrayOpacity : solidOpacity,
        depthWrite: !state.isXray,
        side: THREE.DoubleSide
      });
      mat._xrayOpacity = xrayOpacity;
      mat._solidOpacity = solidOpacity;
      shellMeshes.push(mat);
      return mat;
    };

    const addArchBox = (
      floorNum,
      w,
      h,
      d,
      x,
      y,
      z,
      colorHex = 0x78828c,
      xrayOp = 0.13,
      edgeHex = 0x38bdf8,
      edgeOp = 0.42,
      solidOp = 0.96
    ) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = createShellMat(colorHex, xrayOp, solidOp);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      floorGroups[floorNum].add(mesh);

      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({
        color: edgeHex,
        transparent: true,
        opacity: state.isXray ? edgeOp : Math.min(edgeOp * 0.55, 0.35)
      });
      lineMat._xrayOpacity = edgeOp;
      shellEdgeLines.push(lineMat);
      const line = new THREE.LineSegments(edges, lineMat);
      line.position.set(x, y, z);
      floorGroups[floorNum].add(line);
      return mesh;
    };

    const FLOOR_H = 3.2;
    // Where the 5-story front block steps down to the 3-story rear Back Deck (right behind Middle rooms)
    const STEP_Z = -3.0;

    /**
     * Builds a continuous, structurally connected dog-leg staircase from a floor's
     * hallway (`y0 + 0.18`) up to the next floor's slab & hallway (`y0 + FLOOR_H + 0.12`).
     */
    const buildConnectedStaircase = (
      floorNum,
      y0,
      zStart,
      zTurn,
      fillHex = 0x3b82f6,
      edgeHex = 0x93c5fd
    ) => {
      const halfH = FLOOR_H * 0.5;
      const landingY = y0 + halfH;
      const stepsPerFlight = 7;
      const dz = (zTurn - zStart) / stepsPerFlight;
      const dyLower = (halfH - 0.18) / stepsPerFlight;
      const dyUpper = halfH / stepsPerFlight;
      const treadD = Math.abs(dz) + 0.04;

      // 1. Hallway Departure Threshold Pad (connects hallway runner to step 1)
      addArchBox(
        floorNum,
        2.88,
        0.08,
        0.55,
        3.72,
        y0 + 0.22,
        zStart - Math.sign(dz) * 0.25,
        0x334155,
        0.48,
        edgeHex,
        0.75
      );

      // 2. Lower Flight (Inner lane x = 3.02): connected riser + tread blocks
      for (let s = 0; s < stepsPerFlight; s++) {
        const stepTopY = y0 + 0.18 + (s + 1) * dyLower;
        const stepH = dyLower + 0.12;
        const stepZ = zStart + (s + 0.5) * dz;
        addArchBox(
          floorNum,
          1.32,
          stepH,
          treadD,
          3.02,
          stepTopY - stepH / 2,
          stepZ,
          fillHex,
          0.52,
          edgeHex,
          0.88
        );
      }

      // 3. Full-Width Mid-Floor Turn Landing (spans x = 2.26 .. 5.26 at zTurn)
      const turnCenterZ = zTurn + Math.sign(dz) * 0.52;
      addArchBox(
        floorNum,
        2.96,
        0.2,
        1.08,
        3.74,
        landingY,
        turnCenterZ,
        0x334155,
        0.58,
        edgeHex,
        0.9
      );

      // 4. Upper Return Flight (Outer lane x = 4.46): climbs from mid-landing to upper floor slab
      for (let s = 0; s < stepsPerFlight; s++) {
        const stepTopY = landingY + (s + 1) * dyUpper;
        const stepH = dyUpper + 0.12;
        const stepZ = zTurn - (s + 0.5) * dz;
        addArchBox(
          floorNum,
          1.32,
          stepH,
          treadD,
          4.46,
          stepTopY - stepH / 2,
          stepZ,
          fillHex,
          0.52,
          edgeHex,
          0.88
        );
      }

      // 5. Upper Floor Arrival Landing Pad (bridges top step flush into the next floor's hallway)
      addArchBox(
        floorNum,
        2.88,
        0.18,
        0.65,
        3.72,
        y0 + FLOOR_H + 0.09,
        zStart - Math.sign(dz) * 0.28,
        0x334155,
        0.52,
        edgeHex,
        0.85
      );

      // 6. Central Divider Spine Wall & Handrail Balustrade between the two flights
      const spineLen = Math.abs(zTurn - zStart);
      const spineMidZ = (zStart + zTurn) / 2;
      addArchBox(
        floorNum,
        0.1,
        FLOOR_H * 0.72,
        spineLen,
        3.74,
        y0 + FLOOR_H * 0.48,
        spineMidZ,
        0x1e293b,
        0.55,
        0xbae6fd,
        0.8
      );
    };

    // =========================================================================
    // 1. OWNER'S WATER REFILLING STATION (1F LEFT BAY: "MJ PARUNGAO")
    // =========================================================================
    {
      const f1 = floorGroups[1];
      const wsGeo = new THREE.BoxGeometry(3.4, 2.55, 12.6);
      const wsMat = createShellMat(0x0369a1, 0.22, 0.78);
      const wsMesh = new THREE.Mesh(wsGeo, wsMat);
      wsMesh.position.set(-3.5, 1.5, 1.2);
      f1.add(wsMesh);

      const wsEdge = new THREE.LineSegments(
        new THREE.EdgesGeometry(wsGeo),
        new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.75 })
      );
      wsEdge.position.copy(wsMesh.position);
      f1.add(wsEdge);

      addArchBox(1, 0.18, FLOOR_H, 13.2, -1.68, 1.6, 1.2, 0x94a3b8, 0.28, 0x38bdf8, 0.65);

      for (let t = 0; t < 3; t++) {
        const cylGeo = new THREE.CylinderGeometry(0.32, 0.32, 1.65, 12);
        const cylEdges = new THREE.LineSegments(
          new THREE.EdgesGeometry(cylGeo),
          new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.7 })
        );
        cylEdges.position.set(-4.3 + t * 0.75, 1.05, 0.5);
        f1.add(cylEdges);
      }

      addArchBox(1, 2.8, 0.95, 0.9, -3.5, 0.7, 6.8, 0x0284c7, 0.45, 0x67e8f9, 0.85);
      addArchBox(1, 2.7, 0.65, 0.12, -3.5, 2.55, 7.65, 0xf8fafc, 0.75, 0x0284c7, 0.95);
    }

    // =========================================================================
    // 2. FLOORS 1 TO 3 (FULL DEPTH z = +8.0 .. -10.0, depth = 18.0m) +
    //    FLOORS 4 TO 5 (FRONT BLOCK z = +8.0 .. STEP_Z) +
    //    4F REAR STEPPED-DOWN BACK DECK (z = STEP_Z .. -10.0)
    // =========================================================================
    for (let f = 1; f <= 5; f++) {
      const y0 = (f - 1) * FLOOR_H;
      const yCenter = y0 + FLOOR_H / 2;
      const isFullDepth = f <= 3;

      if (isFullDepth) {
        // Full-depth slab (z = -10.0 .. +8.0, depth = 18.0, center z = -1.0)
        addArchBox(f, 11.0, 0.18, 18.0, 0, y0 + 0.09, -1.0, 0x64748b, 0.2, 0x38bdf8, 0.5);
        // Left, Rear, and Right full-depth exterior walls
        addArchBox(f, 0.22, FLOOR_H, 18.0, -5.39, yCenter, -1.0, 0x78828c, 0.12, 0x38bdf8, 0.36);
        addArchBox(f, 11.0, FLOOR_H, 0.22, 0, yCenter, -9.89, 0x78828c, 0.12, 0x38bdf8, 0.36);
        addArchBox(f, 0.22, FLOOR_H, 18.0, 5.39, yCenter, -1.0, 0x78828c, 0.12, 0x38bdf8, 0.36);

        if (f === 3) {
          // 3F Right-wall tall vertical barred stairwell window (front-right bay)
          addArchBox(3, 0.28, 2.1, 2.0, 5.42, yCenter, 4.4, 0x0f172a, 0.45, 0x60a5fa, 0.8);
          // Two horizontal multi-pane corridor windows on 3F right wall (inside red circle of Photo 1!)
          addArchBox(3, 0.28, 0.9, 2.8, 5.42, yCenter - 0.1, 0.2, 0x0f172a, 0.48, 0x60a5fa, 0.85);
          addArchBox(3, 0.28, 0.85, 2.2, 5.42, yCenter - 0.15, -5.8, 0x0f172a, 0.48, 0x60a5fa, 0.85);
        }
      } else {
        // 4F & 5F Front Indoor Block (z = STEP_Z .. +8.0)
        const frontDepth = 8.0 - STEP_Z;
        const frontCenterZ = (8.0 + STEP_Z) / 2;

        // Indoor slab for front block
        addArchBox(f, 11.0, 0.18, frontDepth, 0, y0 + 0.09, frontCenterZ, 0x64748b, 0.22, 0x38bdf8, 0.52);

        // Left wall of front block (with 4F recessed AC niche)
        if (f === 4) {
          addArchBox(4, 0.22, FLOOR_H, 7.5, -5.39, yCenter, 0.75, 0x78828c, 0.13, 0x38bdf8, 0.38);
          addArchBox(4, 0.22, FLOOR_H, 1.9, -5.39, yCenter, 7.05, 0x78828c, 0.13, 0x38bdf8, 0.38);
          addArchBox(4, 0.65, 1.45, 1.6, -5.08, yCenter + 0.15, 5.25, 0x1e293b, 0.38, 0x94a3b8, 0.75);
        } else {
          addArchBox(5, 0.22, FLOOR_H, frontDepth, -5.39, yCenter, frontCenterZ, 0x78828c, 0.13, 0x38bdf8, 0.38);
        }

        // Stepped Rear Wall of the 4F/5F Front Block at z = STEP_Z
        if (f === 4) {
          // 4F Rear Wall behind Room 302 (x = -5.5 .. +2.15), leaving the right-side hallway open for the Entrance Gate!
          addArchBox(4, 7.65, FLOOR_H, 0.22, -1.65, yCenter, STEP_Z, 0x78828c, 0.16, 0x38bdf8, 0.5);
          // 4F Rear Hallway Entrance Frame & Security Grille Gate at z = STEP_Z (-3.0)
          addArchBox(4, 3.25, 0.45, 0.24, 3.76, y0 + FLOOR_H - 0.23, STEP_Z, 0x78828c, 0.28, 0x38bdf8, 0.65);
          addArchBox(4, 0.28, FLOOR_H, 0.26, 2.24, yCenter, STEP_Z, 0xe2e8f0, 0.55, 0xffffff, 0.88);
          addArchBox(4, 0.28, FLOOR_H, 0.26, 5.26, yCenter, STEP_Z, 0xe2e8f0, 0.55, 0xffffff, 0.88);
          // Double-leaf barred security gate leading from the Back Deck walkway into the 4F/5F hallway
          addArchBox(4, 2.72, 2.52, 0.1, 3.75, y0 + 1.42, STEP_Z, 0x1e293b, 0.42, 0x38bdf8, 0.9);
          addArchBox(4, 0.08, 2.52, 0.14, 3.75, y0 + 1.42, STEP_Z, 0x94a3b8, 0.7, 0xffffff, 0.95);
        } else {
          addArchBox(5, 11.0, FLOOR_H, 0.22, 0, yCenter, STEP_Z, 0x78828c, 0.16, 0x38bdf8, 0.5);
        }

        // Right Exterior Wall of the 4F/5F Front Block
        addArchBox(f, 0.22, FLOOR_H, frontDepth, 5.39, yCenter, frontCenterZ, 0x78828c, 0.13, 0x38bdf8, 0.38);

        if (f === 4) {
          // 4F Right-wall tall vertical barred window opening
          addArchBox(4, 0.28, 2.1, 2.0, 5.42, yCenter, 4.4, 0x0f172a, 0.45, 0x60a5fa, 0.8);
        } else if (f === 5) {
          // 5F Right-wall upper square window near front corner
          addArchBox(5, 0.28, 1.2, 1.3, 5.42, yCenter + 0.2, 4.6, 0x0f172a, 0.48, 0xf8fafc, 0.85);
        }
      }

      // -----------------------------------------------------------------------
      // RIGHT-SIDE CORRIDOR & STAIRCASE AT THE END OF THE MAIN HALLWAY
      // -----------------------------------------------------------------------
      const corrDepth = isFullDepth ? 17.4 : 8.0 - STEP_Z - 0.3;
      const corrCenterZ = isFullDepth ? -1.0 : (8.0 + STEP_Z) / 2;

      // Interior corridor partition wall
      addArchBox(f, 0.16, FLOOR_H, corrDepth, 2.12, yCenter, corrCenterZ, 0x94a3b8, 0.17, 0x38bdf8, 0.48);

      // Chevron-tiled hallway floor runner
      addArchBox(f, 2.95, 0.05, corrDepth, 3.72, y0 + 0.2, corrCenterZ, 0x334155, 0.28, 0x60a5fa, 0.45);

      // Front security grille gate
      addArchBox(f, 3.0, 2.6, 0.08, 3.72, y0 + 1.5, 7.72, 0x1e293b, 0.32, 0x94a3b8, 0.75);
      if (isFullDepth) {
        // Rear security grille gate at back of 1F–3F hallway
        addArchBox(f, 3.0, 2.6, 0.08, 3.72, y0 + 1.5, -9.72, 0x1e293b, 0.32, 0x94a3b8, 0.75);
      }

      // 1) REAR HALLWAY STAIRCASE (1F -> 2F -> 3F -> 4F Rear Shed)
      //    Placed at z = -6.35 .. -8.55 so the 3rd-floor stairs rise 100% inside the Rear Shed (z = -6.0 .. -9.88)!
      if (f <= 3) {
        buildConnectedStaircase(f, y0, -6.35, -8.55, 0x3b82f6, 0x93c5fd);
      }

      // 2) 4TH-TO-5TH FLOOR STAIRCASE (4F -> 5F)
      //    Placed at z = +0.55 .. +1.85 (between the Middle Room door at z = -0.45 and Front Room window at z = +3.75)
      //    so tenants walk out of the Rear Shed (z = -6.0), through the 4F Entrance Gate (z = -3.0),
      //    past Room 302, and straight up to the 5th floor without blocking any gate, door, or window!
      if (f === 4) {
        buildConnectedStaircase(4, y0, 0.55, 1.85, 0x0284c7, 0x7dd3fc);
      } else if (f === 5) {
        // 5th-Floor Stairwell Arrival Landing & Wrap-Around Guardrail (where 4F->5F stairs arrive)
        addArchBox(5, 2.9, 0.85, 0.08, 3.74, y0 + 0.55, 0.3, 0x1e293b, 0.6, 0x7dd3fc, 0.85);
        addArchBox(5, 0.08, 0.85, 2.2, 3.74, y0 + 0.55, 1.4, 0x1e293b, 0.6, 0x7dd3fc, 0.85);
      }

      // Red Fire Hose Cabinet + Room Doors & Sliding Windows along the hallway
      if (f >= 2) {
        const fireCabinetZ = f <= 3 ? 2.25 : 6.1;
        addArchBox(f, 0.18, 0.92, 0.72, 5.22, y0 + 1.55, fireCabinetZ, 0xdc2626, 0.8, 0xfca5a5, 0.95);

        if (f <= 3) {
          for (const roomZ of [5.0, -0.4, -5.8]) {
            addArchBox(f, 0.2, 2.0, 0.82, 2.12, y0 + 1.2, roomZ + 0.9, 0x475569, 0.48, 0xe2e8f0, 0.85);
            addArchBox(f, 0.2, 1.12, 1.35, 2.12, y0 + 1.55, roomZ - 0.35, 0x0ea5e9, 0.4, 0xbae6fd, 0.85);
            addArchBox(f, 0.34, 0.42, 0.62, 2.12, y0 + 2.55, roomZ + 0.9, 0xcbd5e1, 0.52, 0xffffff, 0.85);
          }
        } else {
          // 4F & 5F Front Room (Room 301 / 401): door at z = +5.05, window at z = +3.75 (ahead of 4F->5F stairs)
          addArchBox(f, 0.2, 2.0, 0.82, 2.12, y0 + 1.2, 5.05, 0x475569, 0.48, 0xe2e8f0, 0.85);
          addArchBox(f, 0.2, 1.12, 1.35, 2.12, y0 + 1.55, 3.75, 0x0ea5e9, 0.4, 0xbae6fd, 0.85);
          addArchBox(f, 0.34, 0.42, 0.62, 2.12, y0 + 2.55, 5.05, 0xcbd5e1, 0.52, 0xffffff, 0.85);

          // 4F & 5F Middle Room (Room 302 / 410): door at z = -0.45, window at z = -1.75 (between 4F Gate and 4F->5F stairs)
          addArchBox(f, 0.2, 2.0, 0.82, 2.12, y0 + 1.2, -0.45, 0x475569, 0.48, 0xe2e8f0, 0.85);
          addArchBox(f, 0.2, 1.12, 1.35, 2.12, y0 + 1.55, -1.75, 0x0ea5e9, 0.4, 0xbae6fd, 0.85);
          addArchBox(f, 0.34, 0.42, 0.62, 2.12, y0 + 2.55, -0.45, 0xcbd5e1, 0.52, 0xffffff, 0.85);
        }
      }

      // -----------------------------------------------------------------------
      // FRONT FACADE ARCHITECTURE (z = +8.0)
      // -----------------------------------------------------------------------
      if (f === 1) {
        for (const px of [-5.25, -1.68, 2.12, 5.25]) {
          addArchBox(1, 0.38, FLOOR_H, 0.42, px, yCenter, 7.75, 0xf8fafc, 0.6, 0xffffff, 0.92);
        }
        addArchBox(1, 4.2, 0.26, 1.15, 0.22, y0 + FLOOR_H - 0.12, 8.22, 0xf8fafc, 0.72, 0xffffff, 0.98);
        addArchBox(1, 0.16, 0.75, 0.75, -1.62, y0 + FLOOR_H - 0.55, 8.05, 0xf8fafc, 0.7, 0xffffff, 0.95);
        addArchBox(1, 0.16, 0.75, 0.75, 2.06, y0 + FLOOR_H - 0.55, 8.05, 0xf8fafc, 0.7, 0xffffff, 0.95);
        addArchBox(1, 1.5, 0.42, 0.1, 0.25, y0 + 2.35, 7.62, 0x1e293b, 0.75, 0xfbbf24, 0.95);
        addArchBox(1, 0.75, 0.32, 0.1, -0.55, y0 + 2.8, 7.62, 0x0f172a, 0.7, 0x94a3b8, 0.9);
        addArchBox(1, 0.75, 0.32, 0.1, 1.05, y0 + 2.8, 7.62, 0x0f172a, 0.7, 0x94a3b8, 0.9);
      } else if (f === 2 || f === 3) {
        addArchBox(f, 7.65, FLOOR_H, 0.22, -1.65, yCenter, 7.89, 0x78828c, 0.18, 0x38bdf8, 0.52);
        addArchBox(f, 7.8, 0.22, 0.38, -1.65, y0 + FLOOR_H - 0.12, 8.06, 0xf8fafc, 0.72, 0xffffff, 0.96);
        addArchBox(f, 7.8, 0.22, 0.38, -1.65, y0 + 0.12, 8.06, 0xf8fafc, 0.72, 0xffffff, 0.96);
        addArchBox(f, 0.24, FLOOR_H, 0.38, 2.15, yCenter, 8.06, 0xf8fafc, 0.72, 0xffffff, 0.96);

        for (const winX of [-3.55, 0.25]) {
          addArchBox(f, 1.6, 1.48, 0.42, winX, yCenter + 0.05, 8.12, 0xf8fafc, 0.75, 0xffffff, 0.98);
          addArchBox(f, 1.24, 1.12, 0.46, winX, yCenter + 0.05, 8.14, 0x0f172a, 0.62, 0x38bdf8, 0.92);
        }

        if (f === 2) {
          addArchBox(f, 1.15, 0.68, 0.1, 3.25, y0 + 1.05, 8.24, 0xfef2f2, 0.88, 0xef4444, 1.0);
        }
      } else if (f === 4) {
        // 4F Front Recessed Double-Bay Balcony Terrace (z = +6.32 .. +8.0, depth = 1.68m)
        addArchBox(4, 7.65, FLOOR_H, 0.2, -1.65, yCenter, 6.32, 0x78828c, 0.18, 0x38bdf8, 0.48);
        // Balcony Terrace Floor Slab & Tiled Decking
        addArchBox(4, 7.65, 0.2, 1.68, -1.65, y0 + 0.12, 7.16, 0x475569, 0.35, 0x94a3b8, 0.7);
        addArchBox(4, 7.35, 0.05, 1.45, -1.65, y0 + 0.24, 7.18, 0x334155, 0.32, 0x60a5fa, 0.55);
        // Balcony sliding glass door & window on recessed wall (z = 6.32)
        addArchBox(4, 1.45, 2.05, 0.24, -3.45, y0 + 1.22, 6.34, 0x0f172a, 0.5, 0xbae6fd, 0.88);
        addArchBox(4, 1.45, 1.35, 0.24, 0.15, y0 + 1.55, 6.34, 0x0f172a, 0.5, 0xbae6fd, 0.88);
        // Central white balcony divider column & outer frame pilasters
        addArchBox(4, 0.42, FLOOR_H, 0.4, -1.65, yCenter, 7.96, 0xf8fafc, 0.72, 0xffffff, 0.96);
        addArchBox(4, 0.32, FLOOR_H, 0.4, -5.35, yCenter, 7.96, 0xf8fafc, 0.72, 0xffffff, 0.96);
        addArchBox(4, 0.32, FLOOR_H, 0.4, 2.15, yCenter, 7.96, 0xf8fafc, 0.72, 0xffffff, 0.96);
        addArchBox(4, 7.8, 0.22, 0.4, -1.65, y0 + FLOOR_H - 0.12, 8.06, 0xf8fafc, 0.72, 0xffffff, 0.96);
        // 4 horizontal black metal railing bars across the double-bay terrace
        for (let r = 0; r < 4; r++) {
          addArchBox(4, 7.4, 0.06, 0.08, -1.65, y0 + 0.36 + r * 0.24, 7.95, 0x18181b, 0.75, 0x94a3b8, 0.9);
        }
      } else if (f === 5) {
        const frontDepth = 8.0 - STEP_Z;
        const frontCenterZ = (8.0 + STEP_Z) / 2;
        addArchBox(5, 11.0, FLOOR_H, 0.22, 0, yCenter, 7.89, 0x78828c, 0.18, 0x38bdf8, 0.52);
        for (const winX of [-3.55, 0.15, 3.35]) {
          addArchBox(5, 1.5, 1.35, 0.42, winX, yCenter + 0.08, 8.12, 0xf8fafc, 0.75, 0xffffff, 0.98);
          addArchBox(5, 1.15, 1.0, 0.46, winX, yCenter + 0.08, 8.14, 0x0f172a, 0.62, 0x38bdf8, 0.92);
        }
        addArchBox(5, 0.68, 0.52, 0.45, 1.75, yCenter + 0.42, 8.15, 0x334155, 0.7, 0xe2e8f0, 0.9);
        // 5th-Floor Upper Roof Slab & Cornice (strictly over the front block, matching satellite view!)
        addArchBox(5, 11.35, 0.3, frontDepth + 0.4, 0, y0 + FLOOR_H, frontCenterZ, 0xe2e8f0, 0.45, 0xffffff, 0.9);
        addArchBox(6, 11.0, 0.55, frontDepth, 0, y0 + FLOOR_H + 0.28, frontCenterZ, 0x64748b, 0.18, 0x38bdf8, 0.48);
      }

      if (f >= 2 && f <= 4) {
        const numLouvers = 10;
        for (let l = 0; l < numLouvers; l++) {
          const lx = 2.42 + l * 0.3;
          addArchBox(f, 0.08, FLOOR_H, 0.18, lx, yCenter, 8.08, 0x18181b, 0.7, 0x64748b, 0.88);
        }
      }
    }

    // =========================================================================
    // 3. 4TH-FLOOR REAR STEPPED-DOWN BACK DECK + STAIRWELL BULKHEAD + WATER TANK
    //    (Matches the red-circled exterior photo & satellite view!)
    // =========================================================================
    {
      const deckY = 3 * FLOOR_H; // Top of 3rd floor = 9.6
      const deckDepth = STEP_Z - -10.0; // 7.0m rear deck depth (z = -3.0 .. -10.0)
      const deckCenterZ = (STEP_Z + -10.0) / 2; // -6.5

      // Open Back Deck Floor Slab & Waterproofed Terrace Surface
      addArchBox(4, 11.0, 0.22, deckDepth, 0, deckY + 0.11, deckCenterZ, 0x475569, 0.35, 0x38bdf8, 0.75);
      // Open Rear Terrace Tile Grid Accent (strictly in the 3.0m open middle terrace z = -3.0 .. -6.0)
      addArchBox(4, 7.1, 0.05, 2.75, -1.65, deckY + 0.24, -4.5, 0x334155, 0.32, 0x60a5fa, 0.6);

      // Stepped-down Back Deck Concrete Parapet Walls (Left, Rear, and Right walls at 4F height)
      const parapetH = 1.35;
      // Right parapet wall
      addArchBox(4, 0.22, parapetH, deckDepth, 5.39, deckY + parapetH / 2, deckCenterZ, 0x78828c, 0.24, 0x38bdf8, 0.65);
      // Left parapet wall
      addArchBox(4, 0.22, parapetH, deckDepth, -5.39, deckY + parapetH / 2, deckCenterZ, 0x78828c, 0.24, 0x38bdf8, 0.65);
      // Rear parapet wall
      addArchBox(4, 11.0, parapetH, 0.22, 0, deckY + parapetH / 2, -9.89, 0x78828c, 0.24, 0x38bdf8, 0.65);

      // Full-Width Rear Shed / Bulkhead Structure across the back edge of the Back Deck
      // Spans the full width (`x = -5.38 .. +5.38`, `bulkW = 10.76`) from `z = -6.0` to `z = -9.88`
      // completely enclosing the 1F–3F rear stairs (`z = -6.07 .. -9.61`) while leaving `z = -3.0 .. -6.0` open!
      const bulkW = 10.76;
      const bulkH = 2.65;
      const bulkD = 3.88;
      const bulkX = 0;
      const bulkZ = -7.94;
      addArchBox(4, bulkW, bulkH, bulkD, bulkX, deckY + bulkH / 2, bulkZ, 0x94a3b8, 0.22, 0x38bdf8, 0.62);

      // Connected walkway runner along the right side of the open middle terrace (`z = -6.0 .. -3.0`)
      addArchBox(4, 2.95, 0.06, 3.0, 3.72, deckY + 0.24, -4.5, 0x334155, 0.32, 0x60a5fa, 0.5);

      // Discreet, low-profile shed exit doorway & small louver vent on the front face of the rear shed (`z = -6.0`)
      // Aligned at x = 3.72 so tenants exit the shed straight onto the walkway (`x = 3.72`) and through the 4F Gate (`z = -3.0`)!
      addArchBox(4, 1.05, 2.0, 0.14, 3.72, deckY + 1.1, -6.0, 0x334155, 0.32, 0x60a5fa, 0.55);
      addArchBox(4, 0.85, 0.45, 0.14, 2.55, deckY + 2.0, -6.0, 0x1e293b, 0.28, 0x475569, 0.35);

      // Vertical Red Standpipe / Water Pipe on the front-right corner of the rear shed (`z = -6.0`)
      addArchBox(4, 0.12, bulkH + 0.45, 0.12, 5.28, deckY + bulkH / 2 + 0.2, -6.0, 0xdc2626, 0.9, 0xfca5a5, 1.0);

      // Cylindrical Stainless Steel Water Tank positioned right at the BACK-RIGHT EDGE on top of the shed bulkhead
      const tankGeo = new THREE.CylinderGeometry(0.84, 0.84, 2.1, 22);
      const tankMat = createShellMat(0xcbd5e1, 0.68, 0.98);
      const tankMesh = new THREE.Mesh(tankGeo, tankMat);
      tankMesh.position.set(4.32, deckY + bulkH + 1.05, -8.75);
      floorGroups[4].add(tankMesh);

      const tankEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(tankGeo),
        new THREE.LineBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.92 })
      );
      tankEdges.position.copy(tankMesh.position);
      floorGroups[4].add(tankEdges);
    }

    // =========================================================================
    // 4. BUILD ALL 11 INTERACTIVE RENTABLE UNITS (1F COMMERCIAL + 2F–5F ROOMS)
    // =========================================================================
    BUILDING_UNITS.forEach((unit) => {
      const { x, y, z, w, h, d } = unit.bounds;
      const fGroup = floorGroups[unit.floor];

      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshPhongMaterial({
        color: 0x0ea5e9,
        emissive: 0x0284c7,
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: 0.34,
        shininess: 65
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.userData = { unitId: unit.id, unit };
      fGroup.add(mesh);
      pickableMeshes.push(mesh);

      const edgeGeo = new THREE.EdgesGeometry(geo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.92
      });
      const edge = new THREE.LineSegments(edgeGeo, edgeMat);
      edge.position.set(x, y, z);
      fGroup.add(edge);

      const furnGroup = new THREE.Group();
      furnGroup.position.set(x, y - h / 2 + 0.1, z);
      fGroup.add(furnGroup);

      const furnMat = new THREE.LineBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.58
      });

      const addWireFurn = (fw, fh, fd, fx, fy, fz) => {
        const fg = new THREE.EdgesGeometry(new THREE.BoxGeometry(fw, fh, fd));
        const fl = new THREE.LineSegments(fg, furnMat);
        fl.position.set(fx, fy, fz);
        furnGroup.add(fl);
      };

      if (unit.floor === 1) {
        addWireFurn(2.2, 0.9, 0.85, 0.0, 0.45, 3.2);
        addWireFurn(1.6, 2.1, 1.8, -0.7, 1.05, -3.8);
      } else {
        const bedSpread = Math.min(d * 0.28, 1.15);
        addWireFurn(1.85, 0.45, 0.85, -2.2, 0.25, -bedSpread);
        addWireFurn(1.85, 0.45, 0.85, -2.2, 0.25, 0.0);
        addWireFurn(1.85, 0.45, 0.85, -2.2, 0.25, bedSpread);
        addWireFurn(1.75, 2.15, 1.25, 1.4, 1.08, -bedSpread * 0.85);
      }

      unitMeshMap.set(unit.id, { mesh, mat, edge, edgeMat, furnGroup, furnMat, unit });
    });

    // =========================================================================
    // 5. COLOR CODING & SELECTION STATE
    // =========================================================================
    function computeUnitStates() {
      const highlightedTenantUnit =
        state.mode === 'tenant'
          ? resolveBuildingUnit(state.highlightRoom, state.highlightDorm)
          : null;

      BUILDING_UNITS.forEach((unit) => {
        const entry = unitMeshMap.get(unit.id);
        if (!entry) return;

        const unitTenants = state.tenants.filter((t) => {
          const resolved = resolveBuildingUnit(t.room || '', t.dorm || t.dormName || '');
          return resolved && resolved.id === unit.id;
        });

        unit._occupants = unitTenants;
        unit._isTenantOwnUnit = Boolean(
          highlightedTenantUnit && highlightedTenantUnit.id === unit.id
        );

        const isSelected = state.selectedUnitId === unit.id;
        let fillHex;
        let edgeHex;
        let fillOp;

        if (state.mode === 'tenant') {
          if (unit._isTenantOwnUnit) {
            fillHex = 0x10b981;
            edgeHex = 0x6ee7b7;
            fillOp = state.isXray ? 0.6 : 0.88;
          } else if (unit.floor === 1) {
            fillHex = 0xd97706;
            edgeHex = 0xfcd34d;
            fillOp = state.isXray ? 0.34 : 0.68;
          } else {
            fillHex = 0x1e3a8a;
            edgeHex = 0x38bdf8;
            fillOp = state.isXray ? 0.24 : 0.58;
          }
        } else {
          if (unitTenants.length >= unit.capacity) {
            fillHex = 0x059669;
            edgeHex = 0x34d399;
            fillOp = state.isXray ? 0.54 : 0.84;
          } else if (unitTenants.length > 0) {
            fillHex = 0x10b981;
            edgeHex = 0x6ee7b7;
            fillOp = state.isXray ? 0.48 : 0.8;
          } else if (unit.floor === 1) {
            fillHex = 0xd97706;
            edgeHex = 0xfcd34d;
            fillOp = state.isXray ? 0.38 : 0.74;
          } else {
            fillHex = 0x0284c7;
            edgeHex = 0x38bdf8;
            fillOp = state.isXray ? 0.28 : 0.66;
          }
        }

        if (isSelected) {
          edgeHex = 0xfef08a;
          fillOp = Math.min(fillOp + 0.24, 0.94);
        }

        entry.mat.color.setHex(fillHex);
        entry.mat.emissive.setHex(fillHex);
        entry.mat.emissiveIntensity = isSelected ? 0.5 : unit._isTenantOwnUnit ? 0.38 : 0.2;
        entry.mat.opacity = fillOp;
        entry.edgeMat.color.setHex(edgeHex);
      });
    }

    // =========================================================================
    // 6. CAMERA ORBIT, FLOOR ISOLATION & RAYCAST PICKING
    // =========================================================================
    let azimuth = 0.62;
    let elevation = 0.34;
    let targetAzimuth = 0.62;
    let targetElevation = 0.34;
    let distance = 34;
    let targetDistance = 34;
    const lookTarget = new THREE.Vector3(0, 7.8, 0);
    const currentLook = new THREE.Vector3(0, 7.8, 0);

    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

    function applyFloorVisibility(floorKey) {
      state.activeFloor = String(floorKey || 'all');
      if (state.activeFloor === 'all') {
        Object.values(floorGroups).forEach((g) => {
          g.visible = true;
        });
        lookTarget.set(0, 7.8, 0);
        targetDistance = 34;
        targetElevation = 0.34;
      } else {
        const fNum = Number(state.activeFloor);
        Object.entries(floorGroups).forEach(([k, g]) => {
          const kn = Number(k);
          g.visible = kn === fNum;
        });
        const focusY = (fNum - 1) * FLOOR_H + FLOOR_H * 0.5;
        lookTarget.set(0, focusY, 0);
        targetDistance = 23;
        targetElevation = 0.68;
      }
    }

    function selectUnit(unitId, shouldNotify = true) {
      const resolved =
        BUILDING_UNITS.find((u) => u.id === unitId) || resolveBuildingUnit(unitId);
      if (!resolved) return;
      state.selectedUnitId = resolved.id;
      computeUnitStates();
      if (shouldNotify && options.onSelectUnit) {
        options.onSelectUnit(resolved);
      }
    }

    computeUnitStates();
    applyFloorVisibility(state.activeFloor);
    if (state.selectedUnitId && options.onSelectUnit) {
      const initU = BUILDING_UNITS.find((u) => u.id === state.selectedUnitId);
      if (initU) setTimeout(() => options.onSelectUnit(initU), 0);
    }

    let isDragging = false;
    let downX = 0;
    let downY = 0;
    let moveDist = 0;
    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerdown', (e) => {
      isDragging = true;
      downX = e.clientX;
      downY = e.clientY;
      moveDist = 0;
      container.style.cursor = 'grabbing';
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch (_) { }
    });

    renderer.domElement.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      moveDist += Math.abs(dx) + Math.abs(dy);
      targetAzimuth -= dx * 0.0075;
      targetElevation = clamp(targetElevation + dy * 0.006, 0.05, 1.38);
      downX = e.clientX;
      downY = e.clientY;
    });

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      container.style.cursor = 'grab';
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch (_) { }

      if (moveDist < 8) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNDC, camera);
        const visiblePickables = pickableMeshes.filter((m) => m.parent?.visible !== false);
        const hits = raycaster.intersectObjects(visiblePickables, false);
        if (hits.length > 0 && hits[0].object.userData?.unitId) {
          selectUnit(hits[0].object.userData.unitId, true);
        }
      }
    };

    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    container.addEventListener(
      'wheel',
      (e) => {
        targetDistance = clamp(targetDistance + e.deltaY * 0.02, 15, 56);
      },
      { passive: true }
    );

    const handleResize = () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (!nw || !nh) return;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    let rafId = null;
    let pulseTick = 0;
    (function animate() {
      rafId = requestAnimationFrame(animate);
      pulseTick += 0.035;

      if (state.autoSpin && !isDragging) {
        targetAzimuth += 0.0024;
      }

      azimuth += (targetAzimuth - azimuth) * 0.1;
      elevation += (targetElevation - elevation) * 0.1;
      distance += (targetDistance - distance) * 0.1;
      currentLook.lerp(lookTarget, 0.09);

      unitMeshMap.forEach((entry) => {
        if (entry.unit.id === state.selectedUnitId || entry.unit._isTenantOwnUnit) {
          entry.mat.emissiveIntensity = 0.36 + Math.sin(pulseTick * 2.2) * 0.15;
        }
      });

      const rCos = distance * Math.cos(elevation);
      camera.position.set(
        currentLook.x + rCos * Math.sin(azimuth),
        currentLook.y + distance * Math.sin(elevation),
        currentLook.z + rCos * Math.cos(azimuth)
      );
      camera.lookAt(currentLook);
      renderer.render(scene, camera);
    })();

    internalApi = {
      setXrayMode(enabled) {
        state.isXray = Boolean(enabled);
        shellMeshes.forEach((mat) => {
          mat.opacity = state.isXray ? mat._xrayOpacity : mat._solidOpacity;
          mat.depthWrite = !state.isXray;
        });
        shellEdgeLines.forEach((lineMat) => {
          lineMat.opacity = state.isXray ? lineMat._xrayOpacity : 0.25;
        });
        computeUnitStates();
        return state.isXray;
      },
      setAutoRotate(enabled) {
        state.autoSpin = Boolean(enabled);
        return state.autoSpin;
      },
      setFloorFilter(floorKey) {
        applyFloorVisibility(floorKey);
        if (floorKey !== 'all') {
          const fNum = Number(floorKey);
          const firstOnFloor = BUILDING_UNITS.find((u) => u.floor === fNum);
          if (firstOnFloor) selectUnit(firstOnFloor.id, true);
        }
      },
      resetCamera() {
        applyFloorVisibility('all');
        targetAzimuth = 0.62;
        targetElevation = 0.34;
        targetDistance = 34;
      },
      selectUnit(unitId) {
        selectUnit(unitId, true);
        const targetUnit =
          BUILDING_UNITS.find((u) => u.id === unitId) || resolveBuildingUnit(unitId);
        if (targetUnit && state.activeFloor === 'all') {
          const focusY = (targetUnit.floor - 1) * FLOOR_H + FLOOR_H * 0.5;
          lookTarget.set(0, focusY, 0);
        }
      },
      setTenantUnit(roomName, dormType) {
        state.highlightRoom = roomName || '';
        state.highlightDorm = dormType || '';
        const unit = resolveBuildingUnit(state.highlightRoom, state.highlightDorm);
        if (unit) state.selectedUnitId = unit.id;
        computeUnitStates();
      },
      setTenants(newTenants) {
        state.tenants = Array.isArray(newTenants) ? newTenants : [];
        computeUnitStates();
      },
      resize: handleResize
    };

    container._building3DCleanup = () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
      delete container._building3DCleanup;
    };
  }

  if (window.THREE) {
    setup();
  } else {
    const existing = document.querySelector('script[data-threejs-loader]');
    if (existing) {
      existing.addEventListener('load', setup, { once: true });
    } else {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      s.dataset.threejsLoader = 'true';
      s.onload = setup;
      document.head.appendChild(s);
    }
  }

  const controller = {
    setXrayMode(enabled) {
      state.isXray = Boolean(enabled);
      if (internalApi) internalApi.setXrayMode(state.isXray);
      return state.isXray;
    },
    toggleXrayMode() {
      return this.setXrayMode(!state.isXray);
    },
    setAutoRotate(enabled) {
      state.autoSpin = Boolean(enabled);
      if (internalApi) internalApi.setAutoRotate(state.autoSpin);
      return state.autoSpin;
    },
    setAutoSpin(enabled) {
      return this.setAutoRotate(enabled);
    },
    setFloorFilter(floorKey) {
      state.activeFloor = String(floorKey || 'all');
      if (internalApi) internalApi.setFloorFilter(state.activeFloor);
    },
    resetCamera() {
      state.activeFloor = 'all';
      if (internalApi) internalApi.resetCamera();
    },
    resetView() {
      this.resetCamera();
    },
    selectUnit(unitId) {
      if (internalApi) {
        internalApi.selectUnit(unitId);
      } else {
        const resolved =
          BUILDING_UNITS.find((u) => u.id === unitId) || resolveBuildingUnit(unitId);
        if (resolved) {
          state.selectedUnitId = resolved.id;
          options.onSelectUnit?.(resolved);
        }
      }
    },
    setTenantUnit(roomName, dormType) {
      state.highlightRoom = roomName || '';
      state.highlightDorm = dormType || '';
      if (internalApi) internalApi.setTenantUnit(roomName, dormType);
    },
    updateHighlightRoom(roomName, dormType) {
      this.setTenantUnit(roomName, dormType);
    },
    setTenants(newTenants) {
      state.tenants = Array.isArray(newTenants) ? newTenants : [];
      if (internalApi) internalApi.setTenants(state.tenants);
    },
    updateTenants(newTenants) {
      this.setTenants(newTenants);
    },
    resize() {
      if (internalApi) internalApi.resize();
    }
  };

  return controller;
}
