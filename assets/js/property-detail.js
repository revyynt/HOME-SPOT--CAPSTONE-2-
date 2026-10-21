// Property Detail Page JavaScript
import {
  ensureRoomDocument as ensureRoomDocumentInSupabase,
  supabaseData,
  isDataReady,
  waitForSupabaseReady
} from './supabase-service.js';
import { setRoomAvailability } from './room-availability.js';
import { escapeHtml, getUrlParam } from './lib/format.js';
import { formatRoomPrice, mergeRoomData } from './lib/rooms.js';

let currentPanoramaUrl = null;
let mediaSlides = [];
let activeSlideIndex = 0;

function buildMediaSlides(room) {
  const seen = new Set();
  const photos = [];
  const candidates = [room.mainImage, ...(Array.isArray(room.images) ? room.images : []), room.image];
  for (const raw of candidates) {
    const url = String(raw || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    photos.push({
      type: 'photo',
      src: url,
      label: photos.length === 0 ? 'Main Photo' : `Photo ${photos.length + 1}`
    });
  }

  const panoUrl = String(room.panorama || room.image || '').trim();
  if (panoUrl) {
    photos.push({
      type: 'panorama',
      src: panoUrl,
      label: '360° Panoramic View'
    });
  }
  return photos;
}

function renderMediaShowcase(room) {
  mediaSlides = buildMediaSlides(room);
  if (activeSlideIndex >= mediaSlides.length) {
    activeSlideIndex = 0;
  }

  const strip = document.getElementById('mediaThumbnailStrip');
  if (strip) {
    strip.innerHTML = mediaSlides
      .map((slide, idx) => {
        const isActive = idx === activeSlideIndex;
        const frameCls = isActive
          ? 'border-blue-600 bg-blue-50/40 shadow-md opacity-100'
          : 'border-slate-200/90 bg-white opacity-75 hover:opacity-100 hover:border-slate-300';

        if (slide.type === 'panorama') {
          return `
            <button
              type="button"
              data-slide-index="${idx}"
              title="Interactive 360° Panoramic View"
              class="w-28 sm:w-full h-24 p-1 rounded-2xl border-2 transition-all flex-shrink-0 group ${frameCls}"
            >
              <div class="relative w-full h-full rounded-xl overflow-hidden">
                <img src="${escapeHtml(slide.src)}" alt="360° Panorama" class="w-full h-full object-cover brightness-75 group-hover:scale-110 transition-transform duration-300" />
                <div class="absolute inset-0 bg-gradient-to-t from-blue-950/80 via-black/30 to-transparent flex flex-col items-center justify-center text-white">
                  <span class="px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 text-[11px] font-extrabold tracking-wide shadow">360°</span>
                  <span class="text-[10px] font-semibold mt-0.5">Virtual Tour</span>
                </div>
              </div>
            </button>`;
        }

        return `
          <button
            type="button"
            data-slide-index="${idx}"
            title="${escapeHtml(slide.label)}"
            class="w-28 sm:w-full h-24 p-1 rounded-2xl border-2 transition-all flex-shrink-0 group ${frameCls}"
          >
            <div class="relative w-full h-full rounded-xl overflow-hidden">
              <img src="${escapeHtml(slide.src)}" alt="${escapeHtml(slide.label)}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
              <span class="absolute bottom-1.5 right-1.5 bg-black/65 backdrop-blur-xs text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md leading-none">${idx + 1}</span>
            </div>
          </button>`;
      })
      .join('');
  }

  setActiveMediaSlide(activeSlideIndex, room.name);
}

function setActiveMediaSlide(index, roomName = 'Room') {
  if (!mediaSlides.length) return;
  activeSlideIndex = ((index % mediaSlides.length) + mediaSlides.length) % mediaSlides.length;
  const active = mediaSlides[activeSlideIndex];

  const photoStage = document.getElementById('mediaPhotoStage');
  const panoStage = document.getElementById('mediaPanoramaStage');
  const mainImg = document.getElementById('mainImage');
  const counterEl = document.getElementById('mediaSlideCounter');
  const jumpBtn = document.getElementById('mediaJump360Btn');

  if (active.type === 'panorama') {
    photoStage?.classList.add('hidden');
    panoStage?.classList.remove('hidden');
    if (active.src && active.src !== currentPanoramaUrl) {
      currentPanoramaUrl = active.src;
      initPanoramaViewer(active.src);
    } else {
      window.dispatchEvent(new Event('resize'));
    }
    if (counterEl) {
      counterEl.textContent = `360° Panoramic View (${activeSlideIndex + 1} / ${mediaSlides.length})`;
    }
    if (jumpBtn) {
      jumpBtn.querySelector('span').textContent = 'Back to Photos';
    }
  } else {
    panoStage?.classList.add('hidden');
    photoStage?.classList.remove('hidden');
    if (mainImg) {
      mainImg.src = active.src;
      mainImg.alt = `${roomName} - ${active.label}`;
    }
    if (counterEl) {
      counterEl.textContent = `${active.label} • ${activeSlideIndex + 1} / ${mediaSlides.length}`;
    }
    if (jumpBtn) {
      jumpBtn.querySelector('span').textContent = '360° Panorama';
    }
  }

  const strip = document.getElementById('mediaThumbnailStrip');
  if (strip) {
    strip.querySelectorAll('button[data-slide-index]').forEach((btn) => {
      const idx = Number(btn.dataset.slideIndex);
      const isAct = idx === activeSlideIndex;
      btn.classList.toggle('border-blue-600', isAct);
      btn.classList.toggle('bg-blue-50/40', isAct);
      btn.classList.toggle('shadow-md', isAct);
      btn.classList.toggle('opacity-100', isAct);
      btn.classList.toggle('border-slate-200/90', !isAct);
      btn.classList.toggle('bg-white', !isAct);
      btn.classList.toggle('opacity-75', !isAct);
    });
  }
}

function initMediaShowcaseControls() {
  const showcase = document.getElementById('propertyMediaShowcase');
  if (!showcase || showcase.dataset.bound === 'true') return;
  showcase.dataset.bound = 'true';

  showcase.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const thumb = target.closest('button[data-slide-index]');
    if (thumb) {
      const idx = Number(thumb.dataset.slideIndex);
      if (Number.isFinite(idx)) {
        setActiveMediaSlide(idx, document.getElementById('roomName')?.textContent || 'Room');
      }
      return;
    }

    const actionBtn = target.closest('button[data-action]');
    if (!actionBtn) return;

    const roomName = document.getElementById('roomName')?.textContent || 'Room';
    switch (actionBtn.dataset.action) {
      case 'media-prev':
        setActiveMediaSlide(activeSlideIndex - 1, roomName);
        break;
      case 'media-next':
        setActiveMediaSlide(activeSlideIndex + 1, roomName);
        break;
      case 'media-jump-360': {
        const panoIdx = mediaSlides.findIndex((s) => s.type === 'panorama');
        if (panoIdx === -1) break;
        if (activeSlideIndex === panoIdx) {
          setActiveMediaSlide(0, roomName);
        } else {
          setActiveMediaSlide(panoIdx, roomName);
        }
        break;
      }
      default:
        break;
    }
  });
}

function updateAvailabilityUI(room, availableCount) {
  const badge = document.getElementById('availabilityBadge');
  const limitedAvailability = document.getElementById('limitedAvailability');
  const limitedAvailabilityText = document.getElementById('limitedAvailabilityText');
  const reserveBtn = document.getElementById('reserveBtn');
  const inquireBtn = document.getElementById('inquireBtn');
  const fullyBookedMsg = document.getElementById('fullyBookedMsg');

  room.available = typeof availableCount === 'number' ? availableCount : room.available;

  if (room.available > 0) {
    badge.textContent = `${room.available} Available`;
    badge.className =
      'text-lg px-5 py-2 rounded-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold animate-pulse-glow shadow-lg';
    if (limitedAvailability && room.available <= 3) {
      limitedAvailability.classList.remove('hidden');
      limitedAvailabilityText.textContent = `Only ${room.available} ${room.available === 1 ? 'slot' : 'slots'} remaining in this room type`;
    } else if (limitedAvailability) {
      limitedAvailability.classList.add('hidden');
    }
    if (reserveBtn) {
      reserveBtn.disabled = false;
      reserveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      reserveBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        Submit Reservation Request
      `;
    }
    if (inquireBtn) {
      inquireBtn.disabled = false;
      inquireBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      inquireBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
        </svg>
        Inquire Now
      `;
    }
    if (fullyBookedMsg) {
      fullyBookedMsg.classList.add('hidden');
    }
  } else {
    badge.textContent = 'Fully Booked';
    badge.className =
      'text-lg px-5 py-2 rounded-full bg-gradient-to-r from-red-600 to-red-700 text-white font-bold shadow-lg';
    if (limitedAvailability) {
      limitedAvailability.classList.add('hidden');
    }
    if (reserveBtn) {
      reserveBtn.disabled = true;
      reserveBtn.classList.add('opacity-50', 'cursor-not-allowed');
      reserveBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        Currently Full
      `;
    }
    if (inquireBtn) {
      inquireBtn.disabled = true;
      inquireBtn.classList.add('opacity-50', 'cursor-not-allowed');
      inquireBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
        </svg>
        Currently Full
      `;
    }
    if (fullyBookedMsg) {
      fullyBookedMsg.classList.remove('hidden');
    }
  }
}

function applyRoomDetails(room) {
  document.title = `${room.name} - MJP Residences | homespot AR`;
  document.getElementById('roomBreadcrumb').textContent = room.name;

  initMediaShowcaseControls();
  renderMediaShowcase(room);

  document.getElementById('roomName').textContent = room.name;
  document.getElementById('roomTypeSize').textContent = `${room.type} • ${room.size}`;
  document.getElementById('roomType').textContent = room.type;
  document.getElementById('roomCapacity').textContent =
    `${room.capacity} ${room.capacity === 1 ? 'Person' : 'People'}`;
  document.getElementById('roomSize').textContent = room.size;
  document.getElementById('roomDescription').textContent = room.description;

  const featuresContainer = document.getElementById('roomFeatures');
  if (featuresContainer) {
    featuresContainer.innerHTML = (room.features || [])
      .map(
        (feature) => `
      <div class="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-green-50 p-3 rounded-lg hover:from-blue-100 hover:to-green-100 transition-colors shadow-sm group">
        <svg class="w-5 h-5 text-green-600 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
        </svg>
        <span class="text-gray-800 font-medium">${escapeHtml(feature)}</span>
      </div>
    `
      )
      .join('');
  }

  const panoramaUrl = room.panorama || room.image;
  if (panoramaUrl && panoramaUrl !== currentPanoramaUrl) {
    currentPanoramaUrl = panoramaUrl;
    initPanoramaViewer(panoramaUrl);
  }

  document.getElementById('roomPrice').textContent = formatRoomPrice(room.price, true);
  updateAvailabilityUI(room, room.available);
}

async function loadRemoteRoomData(room) {
  if (!isDataReady()) {
    applyRoomDetails(room);
    return;
  }
  const roomRef = await ensureRoomDocumentInSupabase(room);
  if (!roomRef) {
    applyRoomDetails(room);
    return;
  }

  const applySnapshot = (snapshot) => {
    if (snapshot.exists()) {
      const merged = mergeRoomData(room, snapshot.data());
      Object.assign(room, merged);
    }
    applyRoomDetails(room);
  };

  try {
    const roomSnap = await supabaseData.getDoc(roomRef);
    applySnapshot(roomSnap);
  } catch {
    applyRoomDetails(room);
  }

  supabaseData.onSnapshot(roomRef, applySnapshot, (error) =>
    console.error('Room detail subscription failed:', error)
  );
}

// Load room data when page loads
document.addEventListener('DOMContentLoaded', () => {
  const rawParam = getUrlParam('id') || '1';
  const room = { ...mergeRoomData(rawParam) };
  loadRemoteRoomData(room);
});

// 360 Panoramic Viewer
function initPanoramaViewer(imageUrl) {
  const container = document.getElementById('panoramaViewer');
  const rotationIndicator = document.getElementById('rotationIndicator');

  if (!container) return;

  // Clean up any previous instance
  container._panoramaCleanup?.();
  container._targetPanoramaUrl = imageUrl;
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  container.style.cursor = 'grab';
  container.style.background = '#000';

  // Inject Three.js if not already loaded
  function setup() {
    if (container._targetPanoramaUrl !== imageUrl) return;
    const THREE = window.THREE;

    const W = container.clientWidth || 720;
    const H = container.clientHeight || 430;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H);
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%'
    });
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
    let startX = 0,
      startY = 0;
    let autoRotateTimer = null;

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

    // ── Pointer drag ──
    renderer.domElement.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
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

    const stopDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      container.style.cursor = 'grab';
    };
    renderer.domElement.addEventListener('pointerup', stopDrag);
    renderer.domElement.addEventListener('pointercancel', stopDrag);

    // ── Scroll to zoom ──
    container.addEventListener(
      'wheel',
      (e) => {
        camera.fov = clamp(camera.fov + e.deltaY * 0.04, 30, 110);
        camera.updateProjectionMatrix();
      },
      { passive: true }
    );

    // ── Keyboard ──
    window.addEventListener('keyup', (e) => {
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
    });

    // ── Touch (pinch-to-zoom) ──
    let lastPinchDist = null;
    container.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          if (lastPinchDist !== null) {
            camera.fov = clamp(camera.fov - (dist - lastPinchDist) * 0.1, 30, 110);
            camera.updateProjectionMatrix();
          }
          lastPinchDist = dist;
        }
      },
      { passive: true }
    );
    container.addEventListener('touchend', () => {
      lastPinchDist = null;
    });

    // ── Resize ──
    const ro = new ResizeObserver(() => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (!nw || !nh) return;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    });
    ro.observe(container);

    // ── Render loop ──
    let rafId;
    (function loop() {
      rafId = requestAnimationFrame(loop);
      lon += (targetLon - lon) * 0.08;
      lat += (targetLat - lat) * 0.08;
      updateCamera();
      renderer.render(scene, camera);
    })();

    // Expose cleanup
    container._panoramaCleanup = () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
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

// Close inquiry and reservation modals on Escape key press
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const inquiryModal = document.getElementById('inquiryForm');
    const reservationModal = document.getElementById('reservationForm');
    if (inquiryModal && !inquiryModal.classList.contains('hidden')) {
      inquiryModal.classList.add('hidden');
    }
    if (reservationModal && !reservationModal.classList.contains('hidden')) {
      reservationModal.classList.add('hidden');
    }
  }
});

// Availability helper. This page previously defined its own copy of this
// function and assigned it to `window.setRoomAvailability`, silently shadowing
// the identical one in main.js (both files are loaded here). There is now a
// single implementation in ./room-availability.js; this page-specific variant
// only adds a fallback to the room shown in the #roomName heading.
window.setRoomAvailability = async function (roomNameOrCount, maybeCount) {
  const currentRoomNameEl = document.getElementById('roomName');
  await waitForSupabaseReady();
  return setRoomAvailability(roomNameOrCount, maybeCount, {
    fallbackRoomName: currentRoomNameEl?.textContent.trim()
  });
};
