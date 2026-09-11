      // Property Detail Page JavaScript
// Room data
const roomsData = [
  {
    id: 1,
    name: "Triple Occupancy Room",
    type: "Living Space",
    price: "₱10,000/month",
    beds: 1,
    capacity: 3,
    available: 4,
    size: "30 sqm",
    mainImage: "interior room 1.jpg",
    gallery: [
      "InteriorPanorama.png",
    ],
    description: "Spacious apartment unit that can accommodate up to 3 people. Perfect for small families or groups of students looking for a comfortable shared living space.",
    features: ["3 People", "Bathroom", "Aircon Space"],
    panorama: "InteriorPanorama.png",       
  },
  {
    id: 4,
    name: "Commercial Space",
    type: "Space for Business Operations",
    price: "₱12,000/month",
    beds: 0,
    capacity: 4,
    available: 1,
    size: "35 sqm",
    mainImage: "commercial space 1.jpg",
    gallery: [
      "commercial space 360.png",

    ],
    description: "Premium commercial space ideal for business operations. Spacious unit suitable for small offices, retail, or service-based businesses with comfortable working capacity.",
    features: ["4 People", "Bathroom"],
    panorama: "CommercialPanorama.png",
  },
];

// Get URL parameters
function normalizeRoomDocId(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function hasFirestore() {
  return typeof window !== 'undefined' && window.firebaseDb && window.firebaseFirestore;
}

function getRoomDocRef(roomName) {
  if (!hasFirestore() || !roomName) return null;
  const roomId = normalizeRoomDocId(roomName);
  return window.firebaseFirestore.doc(window.firebaseDb, 'rooms', roomId);
}

async function ensureRoomDocument(room) {
  if (!hasFirestore()) return null;
  const roomRef = getRoomDocRef(room.name);
  if (!roomRef) return null;

  const roomSnap = await window.firebaseFirestore.getDoc(roomRef);
  if (!roomSnap.exists()) {
    await window.firebaseFirestore.setDoc(roomRef, {
      name: room.name,
      available: room.available
    });
  }

  return roomRef;
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
    badge.className = 'text-lg px-5 py-2 rounded-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold animate-pulse-glow shadow-lg';
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
    }
    if (fullyBookedMsg) {
      fullyBookedMsg.classList.add('hidden');
    }
  } else {
    badge.textContent = 'Fully Booked';
    badge.className = 'text-lg px-5 py-2 rounded-full bg-gradient-to-r from-red-600 to-red-700 text-white font-bold shadow-lg';
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
    }
    if (fullyBookedMsg) {
      fullyBookedMsg.classList.remove('hidden');
    }
  }
}

async function loadRemoteRoomAvailability(room) {
  if (!hasFirestore()) return;
  const roomRef = await ensureRoomDocument(room);
  if (!roomRef) return;

  const roomSnap = await window.firebaseFirestore.getDoc(roomRef);
  if (roomSnap.exists()) {
    const data = roomSnap.data();
    if (typeof data.available === 'number') {
      updateAvailabilityUI(room, data.available);
    }
  }

  window.firebaseFirestore.onSnapshot(roomRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    if (typeof data.available === 'number') {
      updateAvailabilityUI(room, data.available);
    }
  });
}

function getUrlParameter(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Load room data when page loads
document.addEventListener('DOMContentLoaded', () => {
  const roomId = parseInt(getUrlParameter('id')) || 1;
  const room = roomsData.find(r => r.id === roomId) || roomsData[0];
  
  loadRoomData(room);
});

function loadRoomData(room) {
  // Update page title
  document.title = `${room.name} - MJP Residences | homespot AR`;

  // Breadcrumb
  document.getElementById('roomBreadcrumb').textContent = room.name;
  
  // Main image
  document.getElementById('mainImage').src = room.mainImage;
  document.getElementById('mainImage').alt = room.name;
  
  // Availability badge
  updateAvailabilityUI(room, room.available);
  loadRemoteRoomAvailability(room);
  
  // Room header
  document.getElementById('roomName').textContent = room.name;
  document.getElementById('roomTypeSize').textContent = `${room.type} • ${room.size}`;
  
  // Limited availability alert
  if (room.available > 0 && room.available <= 3) {
    document.getElementById('limitedAvailability').classList.remove('hidden');
    document.getElementById('limitedAvailabilityText').textContent = 
      `Only ${room.available} ${room.available === 1 ? 'slot' : 'slots'} remaining in this room type`;
  }
  
  // Room details
  document.getElementById('roomType').textContent = room.type;
  document.getElementById('roomCapacity').textContent = `${room.capacity} ${room.capacity === 1 ? 'Person' : 'People'}`;
  document.getElementById('roomSize').textContent = room.size;
  
  // Description
  document.getElementById('roomDescription').textContent = room.description;
  
  //              
  const featuresContainer = document.getElementById('roomFeatures');
  featuresContainer.innerHTML = room.features.map(feature => `
    <div class="flex items-center gap-2 bg-gradient-to-r from-blue-50 to-green-50 p-3 rounded-lg hover:from-blue-100 hover:to-green-100 transition-colors shadow-sm group">
      <svg class="w-5 h-5 text-green-600 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
      </svg>
      <span class="text-gray-800 font-medium">${feature}</span>
    </div>
  `).join('');
  
  // Initialize 360 Panoramic Viewer
  initPanoramaViewer(room.gallery[0]);                
  
  // Price
  document.getElementById('roomPrice').textContent = room.price;
  
  // Handle button states if room is full
  if (room.available === 0) {
    document.getElementById('inquireBtn').disabled = true;
    document.getElementById('inquireBtn').classList.add('opacity-50', 'cursor-not-allowed');
    document.getElementById('inquireBtn').innerHTML = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
      </svg>
      Currently Full
    `;
    
    document.getElementById('reserveBtn').disabled = true;
    document.getElementById('reserveBtn').classList.add('opacity-50', 'cursor-not-allowed');
    document.getElementById('reserveBtn').innerHTML = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      Currently Full
    `;
    
    document.getElementById('fullyBookedMsg').classList.remove('hidden');
  }
}

// 360 Panoramic Viewer
 function initPanoramaViewer(imageUrl) {
  const container = document.getElementById('panoramaViewer');
  const rotationIndicator = document.getElementById('rotationIndicator');

  if (!container) return;

  // Clean up any previous instance
  container.innerHTML = '';
  container.style.position = 'relative';
  container.style.overflow = 'hidden';
  container.style.cursor = 'grab';
  container.style.background = '#000';

  // Inject Three.js if not already loaded
  function setup() {
    const THREE = window.THREE;

    const W = container.clientWidth;
    const H = container.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H);
    Object.assign(renderer.domElement.style, {
      position: 'absolute', top: '0', left: '0',
      width: '100%', height: '100%'
    });
    container.appendChild(renderer.domElement);

    // Scene + camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000);

    // Sphere (inside-out)
    const geo = new THREE.SphereGeometry(500, 60, 40);
    geo.scale(-1, 1, 1);
    const texture = new THREE.TextureLoader().load(imageUrl);
    const mat = new THREE.MeshBasicMaterial({ map: texture });
    scene.add(new THREE.Mesh(geo, mat));

    // State
    let lon = 0, lat = 0;
    let targetLon = 0, targetLat = 0;
    let isDragging = false;
    let startX = 0, startY = 0;
    let autoRotateTimer = null;

    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

    function updateCamera() {
      const phi   = THREE.MathUtils.degToRad(90 - lat);
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
    renderer.domElement.addEventListener('pointerdown', e => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
      container.style.cursor = 'grabbing';
      clearTimeout(autoRotateTimer);
    });

    renderer.domElement.addEventListener('pointermove', e => {
      if (!isDragging) return;
      targetLon  -= (e.clientX - startX) * 0.25;
      targetLat  += (e.clientY - startY) * 0.15;
      targetLat   = clamp(targetLat, -80, 80);
      startX = e.clientX;
      startY = e.clientY;
    });

    const stopDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      container.style.cursor = 'grab';
    };
    renderer.domElement.addEventListener('pointerup',     stopDrag);
    renderer.domElement.addEventListener('pointercancel', stopDrag);

    // ── Scroll to zoom ──
    container.addEventListener('wheel', e => {
      camera.fov = clamp(camera.fov + e.deltaY * 0.04, 30, 110);
      camera.updateProjectionMatrix();
    }, { passive: true });

    // ── Keyboard ──
    window.addEventListener('keyup', e => {
      switch (e.key) {
        case 'ArrowLeft':  targetLon  += 15; break;
        case 'ArrowRight': targetLon  -= 15; break;
        case 'ArrowUp':    targetLat   = clamp(targetLat - 10, -80, 80); break;
        case 'ArrowDown':  targetLat   = clamp(targetLat + 10, -80, 80); break;
        default: return;
      }
      updateCamera();
    });

    // ── Touch (pinch-to-zoom) ──
    let lastPinchDist = null;
    container.addEventListener('touchmove', e => {
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
    }, { passive: true });
    container.addEventListener('touchend', () => { lastPinchDist = null; });

    // ── Resize ──
    const ro = new ResizeObserver(() => {
      const nw = container.clientWidth, nh = container.clientHeight;
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