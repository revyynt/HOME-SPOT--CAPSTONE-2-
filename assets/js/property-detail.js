import { initPanoramaViewer } from './lib/panorama.js';
// Property Detail Page JavaScript
import {
  ensureRoomDocument as ensureRoomDocumentInSupabase,
  supabaseData,
  isDataReady,
  waitForSupabaseReady,
  getCurrentUser
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
  const tag360 = document.getElementById('media360Tag');

  if (active.type === 'panorama') {
    photoStage?.classList.add('hidden');
    panoStage?.classList.remove('hidden');
    if (tag360) {
      tag360.classList.remove('hidden');
      tag360.classList.add('flex');
    }
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
    if (tag360) {
      tag360.classList.add('hidden');
      tag360.classList.remove('flex');
    }
    if (mainImg) {
      mainImg.src = active.src;
      mainImg.alt = `${roomName} - ${active.label}`;
      mainImg.classList.remove('hidden');
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
      case 'open-lightbox':
        openMediaLightbox();
        break;
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

  initLightboxControls();
}
function openMediaLightbox() {
  const modal = document.getElementById('mediaLightboxModal');
  if (!modal || !mediaSlides.length) return;
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  renderLightboxSlide(activeSlideIndex);
}

function closeMediaLightbox() {
  const modal = document.getElementById('mediaLightboxModal');
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  const lbPano = document.getElementById('lightboxPanoramaViewer');
  lbPano?._panoramaCleanup?.();
  setActiveMediaSlide(activeSlideIndex, document.getElementById('roomName')?.textContent || 'Room');
}

function renderLightboxSlide(index) {
  if (!mediaSlides.length) return;
  activeSlideIndex = ((index % mediaSlides.length) + mediaSlides.length) % mediaSlides.length;
  const slide = mediaSlides[activeSlideIndex];

  const photoStage = document.getElementById('lightboxPhotoStage');
  const panoStage = document.getElementById('lightboxPanoramaStage');
  const imgEl = document.getElementById('lightboxImage');
  const panoViewer = document.getElementById('lightboxPanoramaViewer');
  const strip = document.getElementById('lightboxThumbnailStrip');

  const zoomControl = document.getElementById('lightboxZoomControl');
  if (slide.type === 'panorama') {
    photoStage?.classList.add('hidden');
    panoStage?.classList.remove('hidden');
    zoomControl?.classList.remove('hidden');
    zoomControl?.classList.add('flex');
    initPanoramaViewer(slide.src, panoViewer, { autoSpin: false });
  } else {
    panoViewer?._panoramaCleanup?.();
    panoStage?.classList.add('hidden');
    photoStage?.classList.remove('hidden');
    zoomControl?.classList.add('hidden');
    zoomControl?.classList.remove('flex');
    if (imgEl) {
      imgEl.src = slide.src;
      imgEl.alt = slide.label || 'Room preview';
    }
  }

  if (strip) {
    strip.innerHTML = mediaSlides
      .map((s, idx) => {
        const isAct = idx === activeSlideIndex;
        const ringCls = isAct
          ? 'border-white ring-2 ring-white/60 scale-110 opacity-100 shadow-xl'
          : 'border-transparent opacity-60 hover:opacity-100';

        const badgeHtml = s.type === 'panorama'
          ? '<span class="absolute inset-0 bg-black/40 flex items-center justify-center text-[9px] font-black text-white">360°</span>'
          : '';

        return `
          <button type="button" data-lightbox-thumb="${idx}"
            title="${escapeHtml(s.label)}"
            class="relative w-12 h-12 rounded-full overflow-hidden border-2 transition-all flex-shrink-0 cursor-pointer ${ringCls}">
            <img src="${escapeHtml(s.src)}" alt="${escapeHtml(s.label)}" class="w-full h-full object-cover" />
            ${badgeHtml}
          </button>
        `;
      })
      .join('');
  }

  setActiveMediaSlide(activeSlideIndex, document.getElementById('roomName')?.textContent || 'Room');
}

function initLightboxControls() {
  const modal = document.getElementById('mediaLightboxModal');
  if (!modal || modal.dataset.bound === 'true') return;
  modal.dataset.bound = 'true';

  const zoomRange = document.getElementById('lightboxZoomRange');
  zoomRange?.addEventListener('input', () => {
    const panoViewer = document.getElementById('lightboxPanoramaViewer');
    panoViewer?._setZoomPercent?.(Number(zoomRange.value));
  });

  const zoomOutBtn = modal.querySelector('button[data-action="zoom-out"]');
  zoomOutBtn?.addEventListener('click', () => {
    const panoViewer = document.getElementById('lightboxPanoramaViewer');
    const cur = panoViewer?._getZoomPercent?.() ?? 44;
    panoViewer?._setZoomPercent?.(cur - 10);
  });

  const zoomInBtn = modal.querySelector('button[data-action="zoom-in"]');
  zoomInBtn?.addEventListener('click', () => {
    const panoViewer = document.getElementById('lightboxPanoramaViewer');
    const cur = panoViewer?._getZoomPercent?.() ?? 44;
    panoViewer?._setZoomPercent?.(cur + 10);
  });

  modal.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target === modal) {
      closeMediaLightbox();
      return;
    }

    const thumb = target.closest('button[data-lightbox-thumb]');
    if (thumb) {
      const idx = Number(thumb.dataset.lightboxThumb);
      if (Number.isFinite(idx)) renderLightboxSlide(idx);
      return;
    }

    const actionBtn = target.closest('button[data-action]');
    if (!actionBtn) return;

    switch (actionBtn.dataset.action) {
      case 'close-lightbox':
        closeMediaLightbox();
        break;
      case 'lightbox-prev':
        renderLightboxSlide(activeSlideIndex - 1);
        break;
      case 'lightbox-next':
        renderLightboxSlide(activeSlideIndex + 1);
        break;
      default:
        break;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      closeMediaLightbox();
    } else if (e.key === 'ArrowLeft') {
      renderLightboxSlide(activeSlideIndex - 1);
    } else if (e.key === 'ArrowRight') {
      renderLightboxSlide(activeSlideIndex + 1);
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

  document.getElementById('roomPrice').textContent = formatRoomPrice(room.price, true);
  const priceSubtitle = document.getElementById('roomPriceSubtitle');
  if (priceSubtitle) {
    const isCommercial =
      room.id === 'commercial-space' || /commercial|business/i.test(`${room.name} ${room.type}`);
    priceSubtitle.textContent = isCommercial ? 'per space / month' : 'per unit / month';
  }
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
  applyRoomDetails(room);
  loadRemoteRoomData(room);
});

// Modal keyboard navigation and Escape key press// Modal keyboard navigation and Escape key press
document.addEventListener('keydown', (e) => {
  const lbModal = document.getElementById('mediaLightboxModal');
  if (lbModal && !lbModal.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      closeMediaLightbox();
      return;
    }
    if (e.key === 'ArrowLeft') {
      renderLightboxSlide(activeSlideIndex - 1);
      return;
    }
    if (e.key === 'ArrowRight') {
      renderLightboxSlide(activeSlideIndex + 1);
      return;
    }
  }

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

getCurrentUser()
  .then((user) => {
    if (user && ['admin', 'superadmin'].includes(user.app_metadata?.role)) {
      const btn = document.getElementById('backToRoomsBtn');
      const text = document.getElementById('backToRoomsBtnText');
      if (btn) {
        btn.onclick = () => {
          window.location.href =
            user.app_metadata?.role === 'superadmin'
              ? 'super-admin-dashboard.html'
              : 'admin-dashboard.html';
        };
      }
      if (text) text.textContent = 'Back to Dashboard';
    }
  })
  .catch(() => null);
