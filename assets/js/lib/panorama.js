/**
 * 360 Panoramic Viewer powered by Three.js.
 *
 * Supports spherical equirectangular projection, mouse/pointer drag rotation,
 * touch swipe, pinch-to-zoom, scroll wheel zoom, keyboard arrows, and auto-rotation.
 *
 * @param {string} imageUrl - URL of the 360 equirectangular panorama image
 * @param {HTMLElement} container - DOM container element to mount the WebGL canvas into
 * @param {Object} [options]
 * @param {boolean} [options.autoSpin=true] - Whether to auto-spin when idle
 */
export function initPanoramaViewer(
  imageUrl,
  container = document.getElementById('panoramaViewer'),
  options = { autoSpin: true }
) {
  if (!container || !imageUrl) return;
  const rotationIndicator =
    container.parentElement?.querySelector('#previewRotationIndicator') ||
    container.parentElement?.querySelector('#rotationIndicator') ||
    document.getElementById('rotationIndicator');

  // Clean up any previous instance
  container._panoramaCleanup?.();
  container._targetPanoramaUrl = imageUrl;
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  container.style.cursor = 'grab';
  container.style.background = '#000';

  function setup() {
    if (container._targetPanoramaUrl !== imageUrl) return;
    const THREE = window.THREE;
    if (!THREE) return;

    const W = container.clientWidth || 720;
    const H = container.clientHeight || 340;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      touchAction: 'none'
    });
    renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
    container.appendChild(renderer.domElement);

    // Scene + camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000);

    // Sphere (inside-out)
    const geo = new THREE.SphereGeometry(500, 60, 40);
    geo.scale(-1, 1, 1);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const texture = loader.load(imageUrl);
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    scene.add(new THREE.Mesh(geo, mat));

    // State
    let lon = 0,
      lat = 0;
    let targetLon = 0,
      targetLat = 0;
    let isDragging = false;
    let isEnlarged = !options.autoSpin;
    let startX = 0,
      startY = 0;
    let autoRotateTimer = null;

    container._setEnlarged = (val) => {
      isEnlarged = Boolean(val);
    };

    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

    function updateCamera() {
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon);
      camera.lookAt(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
      );
      if (rotationIndicator) {
        rotationIndicator.textContent = `${Math.round(((lon % 360) + 360) % 360)}°`;
      }
    }

    // Pointer drag
    renderer.domElement.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch (_) { }
      container.style.cursor = 'grabbing';
      clearTimeout(autoRotateTimer);
    });

    renderer.domElement.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      targetLon -= (e.clientX - startX) * 0.25;
      targetLat += (e.clientY - startY) * 0.15;
      targetLat = clamp(targetLat, -80, 80);
      startX = e.clientX;
      startY = e.clientY;
    });

    const stopDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      if (e?.pointerId !== undefined) {
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch (_) { }
      }
      container.style.cursor = 'grab';
    };
    renderer.domElement.addEventListener('pointerup', stopDrag);
    renderer.domElement.addEventListener('pointercancel', stopDrag);

    // Zoom UI & Scroll
    const updateZoomUI = () => {
      const zoomRange = document.getElementById('lightboxZoomRange');
      const zoomText = document.getElementById('lightboxZoomPercent');
      const percent = Math.round(((110 - camera.fov) / 80) * 100);
      if (zoomRange && document.activeElement !== zoomRange) {
        zoomRange.value = String(percent);
      }
      if (zoomText) {
        zoomText.textContent = `${percent}%`;
      }
    };
    updateZoomUI();

    container._setZoomPercent = (percent) => {
      const p = clamp(percent, 0, 100);
      camera.fov = 110 - (p / 100) * 80;
      camera.updateProjectionMatrix();
      updateZoomUI();
    };

    container._getZoomPercent = () => {
      return Math.round(((110 - camera.fov) / 80) * 100);
    };

    // Scroll to zoom
    container.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        camera.fov = clamp(camera.fov + e.deltaY * 0.04, 30, 110);
        camera.updateProjectionMatrix();
        updateZoomUI();
      },
      { passive: false }
    );

    // Keyboard
    const onKey = (e) => {
      if (!container.isConnected) return;
      switch (e.key) {
        case 'ArrowLeft':
          targetLon += 15;
          break;
        case 'ArrowRight':
          targetLon -= 15;
          break;
        case 'ArrowUp':
          targetLat = clamp(targetLat - 10, -80, 80);
          break;
        case 'ArrowDown':
          targetLat = clamp(targetLat + 10, -80, 80);
          break;
        default:
          return;
      }
      updateCamera();
    };
    window.addEventListener('keyup', onKey);

    // Resize observer
    const ro = new ResizeObserver(() => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (!nw || !nh) return;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    // Render loop
    let rafId;
    (function loop() {
      rafId = requestAnimationFrame(loop);
      if (!container.isConnected || container.offsetParent === null || document.hidden) return;
      if (!isDragging && !isEnlarged) {
        targetLon += 0.08;
      }
      lon += (targetLon - lon) * 0.08;
      lat += (targetLat - lat) * 0.08;
      updateCamera();
      renderer.render(scene, camera);
    })();

    // Expose cleanup
    container._panoramaCleanup = () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('keyup', onKey);
      ro.disconnect();
      renderer.dispose();
      delete container._setEnlarged;
      delete container._setZoomPercent;
      delete container._getZoomPercent;
      delete container._panoramaCleanup;
    };
  }

  // Load Three.js if needed, then init
  if (window.THREE) {
    setup();
  } else {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = setup;
    document.head.appendChild(s);
  }
}
