/**
 * X-ray building viewer.
 *
 * Renders one translucent box per unit, stacked by floor, so an operator can see
 * at a glance which rooms are taken. Geometry is generated from `units` -- there
 * is no model file to load, so nothing has to be authored in Blender and the
 * building updates itself when Firestore changes.
 *
 * All geometry maths lives in ./units.js, which is pure and unit-tested; this
 * module only turns those numbers into meshes. That split is why the layout can
 * be verified in node --test even though Three.js needs a browser.
 *
 * Three.js is the same r128 build property-detail.js already loads, used as a
 * global (there is no bundler in this project).
 */

import {
  UNIT_STATE,
  STATE_COLORS,
  LAYOUT_DEFAULTS,
  layoutUnits,
  buildingBounds,
  deriveUnitState,
  stateColor,
  shouldEmissive
} from './units.js';

const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

let threeLoader = null;

/**
 * Loads Three.js once and resolves when `window.THREE` is ready.
 * @returns {Promise<object>}
 */
export function loadThree() {
  if (typeof window !== 'undefined' && window.THREE) return Promise.resolve(window.THREE);

  if (threeLoader) return threeLoader;

  threeLoader = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('No document: Three.js needs a browser.'));
      return;
    }
    const script = document.createElement('script');
    script.src = THREE_CDN;
    script.async = true;
    script.onload = () =>
      window.THREE
        ? resolve(window.THREE)
        : reject(new Error('Three.js loaded but did not define window.THREE.'));
    script.onerror = () => reject(new Error('Failed to load Three.js from the CDN.'));
    document.head.appendChild(script);
  });

  return threeLoader;
}

/**
 * Minimal orbit controls.
 *
 * Hand-rolled rather than pulling OrbitControls from a second CDN path, so the
 * viewer depends on exactly one external script and the interaction matches the
 * panorama viewer's drag idiom already used on property-detail.js.
 */
function attachOrbit({ dom, camera, target, onChange }) {
  let lon = 0.9;
  let lat = 0.35;
  let targetLon = lon;
  let targetLat = lat;
  let distance = 40;
  let targetDistance = distance;

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  const onPointerDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    dom.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging) return;
    targetLon -= (e.clientX - lastX) * 0.005;
    targetLat = clamp(targetLat + (e.clientY - lastY) * 0.005, -0.6, 0.9);
    lastX = e.clientX;
    lastY = e.clientY;
    onChange?.();
  };

  const onPointerUp = (e) => {
    dragging = false;
    dom.releasePointerCapture?.(e.pointerId);
  };

  const onWheel = (e) => {
    e.preventDefault();
    targetDistance = clamp(targetDistance * (1 + Math.sign(e.deltaY) * 0.1), 8, 220);
    onChange?.();
  };

  dom.addEventListener('pointerdown', onPointerDown);
  dom.addEventListener('pointermove', onPointerMove);
  dom.addEventListener('pointerup', onPointerUp);
  dom.addEventListener('pointercancel', onPointerUp);
  dom.addEventListener('wheel', onWheel, { passive: false });

  return {
    /** Eases the camera toward the target orientation. */
    step() {
      lon += (targetLon - lon) * 0.12;
      lat += (targetLat - lat) * 0.12;
      distance += (targetDistance - distance) * 0.12;

      const phi = Math.PI / 2 - lat;
      camera.position.x = target.x + distance * Math.sin(phi) * Math.cos(lon);
      camera.position.y = target.y + distance * Math.cos(phi);
      camera.position.z = target.z + distance * Math.sin(phi) * Math.sin(lon);
      camera.lookAt(target);
      return { lon, lat, distance };
    },
    /** Frames the building: call after the unit set changes size. */
    frame(width, height) {
      targetDistance = clamp(Math.max(width, height) * 2.1 + 10, 12, 220);
    },
    dispose() {
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
    }
  };
}

/**
 * Creates a viewer bound to `container`.
 *
 * @param {HTMLElement} container
 * @param {Object} [options]
 * @param {(unitId: string|null, point: {x:number,y:number}|null) => void} [options.onHover]
 * @param {(unitId: string|null) => void} [options.onSelect]
 * @param {boolean} [options.showOccupancy] - false hides which rooms are taken
 * @returns {Promise<object>} viewer handle
 */
export async function createBuildingViewer(container, options = {}) {
  const THREE = await loadThree();
  if (!container) throw new Error('createBuildingViewer needs a container element.');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1220);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.7);
  key.position.set(20, 40, 30);
  scene.add(key);

  const target = new THREE.Vector3(0, 0, 0);
  const orbit = attachOrbit({ dom: renderer.domElement, camera, target });

  /** @type {Map<string, THREE.Mesh>} */
  const unitMeshes = new Map();
  const unitGroup = new THREE.Group();
  scene.add(unitGroup);

  /** Translucent shell: the x-ray effect. */
  let shellGroup = new THREE.Group();
  scene.add(shellGroup);

  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0x93c5fd,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const slabMaterial = new THREE.MeshStandardMaterial({
    color: 0xbfdbfe,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  let xray = true;
  let showOccupancy = options.showOccupancy !== false;
  let rafId = null;
  let disposed = false;

  function applyXray() {
    // In "solid" mode the shell becomes opaque and hides the interior.
    shellMaterial.opacity = xray ? 0.16 : 0.95;
    shellMaterial.depthWrite = !xray;
    slabMaterial.opacity = xray ? 0.1 : 0.9;
    slabMaterial.depthWrite = !xray;
    unitGroup.visible = xray;
  }

  /** Rebuilds the translucent shell around the current units. */
  function buildShell(laid) {
    shellGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    shellGroup.clear();
    if (!laid.length) return;

    const bounds = buildingBounds(laid);
    const width =
      Math.max(...laid.map((u) => u.position.x + u.size.width / 2)) -
      Math.min(...laid.map((u) => u.position.x - u.size.width / 2));
    const depth = LAYOUT_DEFAULTS.unitDepth;

    // Four walls -- front/back are omitted so the front rooms stay visible.
    const walls = [
      [width, bounds.height, 0.08, 0, bounds.height / 2, -depth / 2],
      [width, bounds.height, 0.08, 0, bounds.height / 2, depth / 2],
      [0.08, bounds.height, depth, -width / 2 - 0.4, bounds.height / 2, 0],
      [0.08, bounds.height, depth, width / 2 + 0.4, bounds.height / 2, 0]
    ];

    for (const [w, h, d, x, y, z] of walls) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shellMaterial);
      mesh.position.set(x, y, z);
      shellGroup.add(mesh);
    }

    // Floor slabs.
    for (let floor = 1; floor <= bounds.floors; floor++) {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.8, 0.06, depth + 0.4),
        slabMaterial
      );
      slab.position.set(0, (floor - 1) * LAYOUT_DEFAULTS.floorHeight - 0.03, 0);
      shellGroup.add(slab);
    }

    target.y = (bounds.height / 2) * 0.9;
    orbit.frame(width, bounds.height);
  }

  /** Creates one box per unit, coloured by state. */
  function buildUnits(laid, statesById) {
    unitMeshes.forEach((mesh) => {
      unitGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    unitMeshes.clear();

    for (const unit of laid) {
      const state = statesById.get(unit.id) ?? UNIT_STATE.AVAILABLE;

      const geometry = new THREE.BoxGeometry(
        unit.size.width * 0.82,
        unit.size.height,
        unit.size.depth * 0.82
      );
      const material = new THREE.MeshStandardMaterial({
        color: showOccupancy ? stateColor(state) : STATE_COLORS[UNIT_STATE.AVAILABLE],
        transparent: true,
        opacity: 0.92,
        emissive: new THREE.Color(
          showOccupancy && shouldEmissive(state) ? stateColor(state) : 0x000000
        ),
        emissiveIntensity: 0.45
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(unit.position.x, unit.position.y + unit.size.height / 2, unit.position.z);
      mesh.userData = { unitId: unit.id, number: unit.number, state };
      unitGroup.add(mesh);
      unitMeshes.set(unit.id, mesh);
    }
  }

  /**
   * Replaces the building.
   * @param {Array<Object>} units - normalized units
   * @param {Object} [context] - { tenantUnitIds, pendingUnitIds }
   */
  function setUnits(units, context = {}) {
    const laid = layoutUnits(units);

    const statesById = new Map();
    for (const unit of laid) {
      statesById.set(unit.id, resolveState(unit.id, context));
    }

    buildShell(laid);
    buildUnits(laid, statesById);
    applyXray();
    return laid;
  }

  function resolveState(unitId, context) {
    // Delegated to the pure helper so the colour rules stay testable.
    return deriveUnitState(unitId, context);
  }

  // ---- hover / select -----------------------------------------------------

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(unitGroup.children, false);
    return hits.length ? hits[0].object.userData : null;
  }

  renderer.domElement.addEventListener('pointermove', (event) => {
    const hit = pick(event);
    const unitId = hit?.unitId ?? null;
    if (unitId !== hovered) {
      hovered = unitId;
      const point = unitId ? { x: event.clientX, y: event.clientY } : null;
      options.onHover?.(unitId, point);
    } else if (unitId) {
      options.onHover?.(unitId, { x: event.clientX, y: event.clientY });
    }
  });

  renderer.domElement.addEventListener('click', (event) => {
    const hit = pick(event);
    options.onSelect?.(hit?.unitId ?? null);
  });

  // ---- loop ---------------------------------------------------------------

  function resize() {
    const w = container.clientWidth || 640;
    const h = container.clientHeight || 420;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(container);
  resize();

  function loop() {
    if (disposed) return;
    rafId = requestAnimationFrame(loop);
    orbit.step();
    renderer.render(scene, camera);
  }
  loop();

  return {
    setUnits,
    /** Recolours existing meshes without rebuilding the scene. */
    setStates(context = {}) {
      unitMeshes.forEach((mesh, unitId) => {
        const state = resolveState(unitId, context);
        mesh.userData.state = state;
        const color = showOccupancy ? stateColor(state) : STATE_COLORS[UNIT_STATE.AVAILABLE];
        mesh.material.color.setHex(color);
        mesh.material.emissive.setHex(shouldEmissive(state) && showOccupancy ? color : 0x000000);
      });
    },
    setXray(value) {
      xray = Boolean(value);
      applyXray();
    },
    isXray: () => xray,
    setShowOccupancy(value) {
      showOccupancy = Boolean(value);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      observer?.disconnect();
      orbit.dispose();
      unitMeshes.forEach((m) => {
        m.geometry.dispose();
        m.material.dispose();
      });
      unitMeshes.clear();
      shellGroup.traverse((obj) => obj.geometry?.dispose());
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
