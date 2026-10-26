
let currentAdminRooms = [];

function openRoomPreviewModal(room) {
  const modal = document.getElementById('previewRoomModal');
  if (!modal || !room) return;

  const breadcrumbEl = document.getElementById('previewBreadcrumbRoomName');
  const titleEl = document.getElementById('previewRoomTitle');
  const subtitleEl = document.getElementById('previewRoomTypeSize');
  const mainImgEl = document.getElementById('previewMainImg');
  const tag360El = document.getElementById('preview360Tag');
  const jump360Pill = document.getElementById('previewJump360Pill');
  const availBadgeEl = document.getElementById('previewAvailabilityBadge');
  const slideCounterEl = document.getElementById('previewSlideCounter');
  const thumbStripEl = document.getElementById('previewThumbnailStrip');
  const limitedAvailEl = document.getElementById('previewLimitedAvailability');
  const limitedAvailText = document.getElementById('previewLimitedAvailabilityText');
  const detailTypeEl = document.getElementById('previewDetailRoomType');
  const detailCapEl = document.getElementById('previewDetailCapacity');
  const detailSizeEl = document.getElementById('previewDetailSize');
  const detailDescEl = document.getElementById('previewDetailDescription');
  const detailFeaturesEl = document.getElementById('previewDetailFeatures');
  const sidebarPriceEl = document.getElementById('previewSidebarPrice');
  const publicLink = document.getElementById('previewPublicPageLink');

  if (breadcrumbEl) breadcrumbEl.textContent = room.name || 'Apartment Unit';
  if (titleEl) titleEl.textContent = room.name || 'Apartment Unit';
  if (subtitleEl) subtitleEl.textContent = `${room.type || 'Living Space'} • ${room.size || '30 sqm'}`;

  const avail = Number(room.available) || 0;
  if (availBadgeEl) {
    if (avail > 0) {
      availBadgeEl.className = 'text-xs sm:text-sm font-semibold px-4 py-1.5 rounded-full shadow-lg text-white bg-gradient-to-r from-green-500 to-green-600';
      availBadgeEl.textContent = `${avail} Available`;
    } else {
      availBadgeEl.className = 'text-xs sm:text-sm font-semibold px-4 py-1.5 rounded-full shadow-lg text-white bg-gradient-to-r from-red-500 to-red-600';
      availBadgeEl.textContent = 'Fully Booked';
    }
  }

  if (limitedAvailEl && limitedAvailText) {
    if (avail > 0 && avail <= 5) {
      limitedAvailText.textContent = `Only ${avail} slot${avail === 1 ? '' : 's'} remaining in this room type`;
      limitedAvailEl.classList.remove('hidden');
    } else if (avail === 0) {
      limitedAvailText.textContent = 'This unit is currently fully booked.';
      limitedAvailEl.classList.remove('hidden');
    } else {
      limitedAvailEl.classList.add('hidden');
    }
  }

  if (detailTypeEl) detailTypeEl.textContent = room.type || 'Living Space';
  if (detailCapEl) detailCapEl.textContent = `${room.capacity || 1} People`;
  if (detailSizeEl) detailSizeEl.textContent = room.size || '30 sqm';

  if (detailDescEl) {
    detailDescEl.textContent =
      room.description ||
      'Spacious apartment unit that can accommodate occupants looking for a comfortable shared living space at MJP Residences.';
  }

  if (detailFeaturesEl) {
    const feats = Array.isArray(room.features) && room.features.length
      ? room.features
      : [`${room.capacity || 3} People`, 'Bathroom', 'Aircon Space'];
    detailFeaturesEl.innerHTML = feats
      .map(
        (f) => `
        <div class="flex items-center gap-2 bg-emerald-50 text-emerald-900 border border-emerald-200/80 px-3 py-2 rounded-lg text-xs font-semibold">
          <svg class="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="truncate">${escapeHtml(f)}</span>
        </div>`
      )
      .join('');
  }

  if (sidebarPriceEl) {
    sidebarPriceEl.textContent = formatPHP(room.price) + '/month';
  }

  const slides = [];
  const seenUrls = new Set();
  const panoUrl = String(room.panorama || '').trim();

  const addPhotoSlide = (src, label) => {
    const url = String(src || '').trim();
    if (!url || seenUrls.has(url) || (panoUrl && url === panoUrl)) return;
    seenUrls.add(url);
    slides.push({ src: url, label, is360: false });
  };

  if (room.mainImage) addPhotoSlide(room.mainImage, 'Main Photo');
  if (Array.isArray(room.images)) {
    room.images.forEach((url, i) => addPhotoSlide(url, `Photo ${i + 1}`));
  }
  if (room.image) addPhotoSlide(room.image, 'Listing Card');

  if (panoUrl) {
    slides.push({ src: panoUrl, label: '360° Panoramic View', is360: true });
  }

  if (!slides.length) {
    addPhotoSlide('assets/img/triple-occupancy.jpg', 'Main Photo');
  }

  const photoStage = document.getElementById('previewPhotoStage');
  const panoStage = document.getElementById('previewPanoramaStage');
  const panoViewer = document.getElementById('previewPanoramaViewer');

  const updateSlideDisplay = (idx) => {
    const cur = slides[idx] || slides[0];

    if (cur.is360) {
      photoStage?.classList.add('hidden');
      panoStage?.classList.remove('hidden');
      if (tag360El) tag360El.classList.remove('hidden');
      if (panoViewer && cur.src) {
        initPanoramaViewer(cur.src, panoViewer, { autoSpin: true });
      }
    } else {
      panoViewer?._panoramaCleanup?.();
      panoStage?.classList.add('hidden');
      photoStage?.classList.remove('hidden');
      if (mainImgEl) mainImgEl.src = cur.src;
      if (tag360El) tag360El.classList.add('hidden');
    }

    if (slideCounterEl) {
      slideCounterEl.textContent = `${cur.label} • ${idx + 1}/${slides.length}`;
    }

    document.querySelectorAll('.preview-thumb-card').forEach((card, cIdx) => {
      if (cIdx === idx) {
        card.className =
          'preview-thumb-card relative w-28 sm:w-full h-20 sm:h-24 rounded-xl overflow-hidden border-2 border-blue-600 ring-2 ring-blue-300 shadow-md flex-shrink-0 transition-all cursor-pointer';
      } else {
        card.className =
          'preview-thumb-card relative w-28 sm:w-full h-20 sm:h-24 rounded-xl overflow-hidden border-2 border-transparent hover:border-gray-300 shadow-sm flex-shrink-0 transition-all cursor-pointer opacity-80 hover:opacity-100';
      }
    });
  };

  if (jump360Pill) {
    const pIdx = slides.findIndex((s) => s.is360);
    if (pIdx !== -1) {
      jump360Pill.classList.remove('hidden');
      jump360Pill.onclick = () => updateSlideDisplay(pIdx);
    } else {
      jump360Pill.classList.add('hidden');
    }
  }

  if (thumbStripEl) {
    thumbStripEl.innerHTML = slides
      .map(
        (slide, i) => `
        <button
          type="button"
          data-preview-slide-idx="${i}"
          class="preview-thumb-card relative w-28 sm:w-full h-20 sm:h-24 rounded-xl overflow-hidden border-2 ${i === 0
            ? 'border-blue-600 ring-2 ring-blue-300 shadow-md'
            : 'border-transparent hover:border-gray-300 shadow-sm opacity-80 hover:opacity-100'
          } flex-shrink-0 transition-all cursor-pointer group"
        >
          <img src="${escapeHtml(slide.src)}" alt="${escapeHtml(slide.label)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
          ${slide.is360
            ? `<div class="absolute inset-0 bg-gradient-to-t from-blue-900/80 to-transparent flex flex-col items-center justify-end p-1.5">
                   <span class="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">360°</span>
                   <span class="text-[9px] font-semibold text-white tracking-tight mt-0.5">Virtual Tour</span>
                 </div>`
            : `<span class="absolute bottom-1 right-1.5 bg-black/70 text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md">${i + 1}</span>`
          }
        </button>`
      )
      .join('');
  }

  updateSlideDisplay(0);

  thumbStripEl?.querySelectorAll('button[data-preview-slide-idx]').forEach((btn) => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute('data-preview-slide-idx')) || 0;
      updateSlideDisplay(idx);
    };
  });

  if (publicLink) {
    publicLink.href = `property-detail.html?id=${encodeURIComponent(room.id)}`;
  }

  modal.classList.remove('hidden');
}

function closeRoomPreviewModal() {
  const modal = document.getElementById('previewRoomModal');
  const panoViewer = document.getElementById('previewPanoramaViewer');
  panoViewer?._panoramaCleanup?.();
  if (modal) modal.classList.add('hidden');
}

/**
 * Admin dashboard bootstrap.
 *
 * Replaces a ~699-line inline script. Nothing that reads tenant data runs until
 * the auth guard has confirmed a staff session.
 */

import { guardPage } from '../lib/guard.js';
import { initBackButtonGuard, initLogoutButtons } from '../lib/session.js';
import { initTenantTable, listenToTenants } from './admin-dashboard/tenants.js';
import { initCreateTenant } from './admin-dashboard/create-tenant.js';
import { initDetailModals } from './admin-dashboard/modals.js';
import { supabase, supabaseData } from '../supabase-service.js';
import { DEFAULT_ROOMS, formatRoomPrice, mergeRoomData, normalizeRoomDocId } from '../lib/rooms.js';
import { initPanoramaViewer } from '../lib/panorama.js';
import { deduplicatePayments, escapeHtml, formatPHP, initials } from '../lib/format.js';
import { buildPaymentCalendar, buildSalesForecast } from '../lib/payment-calendar.js';
import { initBuilding3DViewer, BUILDING_UNITS, resolveBuildingUnit } from '../lib/building-3d.js';
import { Toast } from '../render/toast.js';
import { attr } from '../lib/dom.js';

const ROOM_MEDIA_BUCKET = 'room-media';

async function uploadRoomFile(roomId, file, prefix = 'img') {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${roomId}/${prefix}-${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(ROOM_MEDIA_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg'
  });
  if (error) throw error;
  const { data } = supabase.storage.from(ROOM_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function renderGalleryItemsHtml(images = []) {
  if (!images.length) {
    return '<p class="text-xs text-gray-400 italic py-2">No gallery images added yet.</p>';
  }
  return images
    .map(
      (url) => `
      <div class="relative group w-24 h-20 rounded-lg overflow-hidden border bg-gray-100 flex-shrink-0" data-gallery-item="${escapeHtml(url)}">
        <img src="${escapeHtml(url)}" alt="Gallery" class="w-full h-full object-cover" />
        <input type="hidden" name="galleryImage" value="${escapeHtml(url)}" />
        <button
          type="button"
          data-action="remove-gallery-image"
          title="Remove image"
          class="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
        >&times;</button>
      </div>`
    )
    .join('');
}

function mountAdminPanoramaPreview(container, imageUrl) {
  if (!container || !imageUrl) return;
  container._cleanup?.();
  container.innerHTML = '';

  const setup = () => {
    const THREE = window.THREE;
    if (!THREE) return;
    const W = container.clientWidth || 500;
    const H = container.clientHeight || 240;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000);
    const geo = new THREE.SphereGeometry(500, 48, 32);
    geo.scale(-1, 1, 1);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const texture = loader.load(imageUrl);
    scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture })));

    let lon = 0;
    let lat = 0;
    let dragging = false;
    let sx = 0;
    let sy = 0;

    renderer.domElement.addEventListener('pointerdown', (e) => {
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
    });
    renderer.domElement.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      lon -= (e.clientX - sx) * 0.25;
      lat = Math.max(-80, Math.min(80, lat + (e.clientY - sy) * 0.15));
      sx = e.clientX;
      sy = e.clientY;
    });
    const stop = () => {
      dragging = false;
    };
    renderer.domElement.addEventListener('pointerup', stop);
    renderer.domElement.addEventListener('pointercancel', stop);

    let rafId;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      if (!dragging) lon += 0.05;
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon);
      camera.lookAt(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta)
      );
      renderer.render(scene, camera);
    };
    tick();

    container._cleanup = () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
    };
  };

  if (window.THREE) {
    setup();
  } else {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    s.onload = setup;
    document.head.appendChild(s);
  }
}

function updateTenantDormSelect(rooms) {
  const select = document.getElementById('tenantDorm');
  if (!select || !Array.isArray(rooms)) return;
  const currentVal = select.value;
  if (!rooms.length) {
    select.innerHTML = '<option value="">No units available</option>';
    return;
  }
  select.innerHTML = rooms
    .map((r) => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`)
    .join('');
  if (currentVal && rooms.some((r) => r.name === currentVal)) {
    select.value = currentVal;
  }
}

function renderListings(rooms) {
  const container = document.getElementById('adminListingsContainer');
  if (!container) return;

  const countEl = document.getElementById('totalListingsCount');
  if (countEl) countEl.textContent = String(rooms.length);

  container.innerHTML = rooms
    .map(
      (room) => `
    <div class="bg-white border rounded-xl p-6 shadow-sm" data-listing-card="${escapeHtml(room.id)}">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <img
            src="${escapeHtml(room.image)}"
            alt="${escapeHtml(room.name)}"
            class="w-24 h-20 object-cover rounded-lg border bg-gray-100"
          />
          <div>
            <div class="flex items-center gap-2 mb-1">
              <h4 class="text-lg font-bold text-gray-900">${escapeHtml(room.name)}</h4>
              ${room.badge ? `<span class="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">${escapeHtml(room.badge)}</span>` : ''}
            </div>
            <p class="text-xs text-gray-500 mb-1.5">${escapeHtml(room.type)} • ${escapeHtml(room.size)}</p>
            <div class="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <span class="${room.available > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} px-2 py-0.5 rounded text-xs font-medium">
                ${room.available > 0 ? `${room.available} Available` : 'Full'}
              </span>
              <span>Capacity: ${escapeHtml(room.capacity)}</span>
              <span class="text-green-600 font-semibold">${escapeHtml(formatRoomPrice(room.price, true))}</span>
              <span class="text-xs text-gray-400">${(room.images || []).length} gallery photo(s)</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            data-action="toggle-edit-room"
            data-room-id="${escapeHtml(room.id)}"
            class="px-3.5 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-1.5 text-sm font-medium cursor-pointer"
          >
            Edit
          </button>
          <button
            type="button"
            data-action="preview-room"
            data-room-id="${escapeHtml(room.id)}"
            class="px-3.5 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-1.5 text-sm font-medium text-gray-700 cursor-pointer"
          >
            View
          </button>
          <button
            type="button"
            data-action="delete-room"
            data-room-id="${escapeHtml(room.id)}"
            data-room-name="${escapeHtml(room.name)}"
            class="px-3.5 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors cursor-pointer"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      <form data-room-edit-form="${escapeHtml(room.id)}" class="hidden mt-5 pt-5 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Unit Title</label>
          <input name="name" value="${escapeHtml(room.name)}" required class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Subtitle / Type</label>
          <input name="type" value="${escapeHtml(room.type)}" required class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Monthly Price (PHP)</label>
          <input name="price" type="number" min="0" step="1" value="${escapeHtml(room.price)}" required class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Badge Text (e.g. Most Popular)</label>
          <input name="badge" value="${escapeHtml(room.badge || '')}" class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Available Units</label>
          <input name="available" type="number" min="0" step="1" value="${escapeHtml(room.available)}" required class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Capacity (People)</label>
            <input name="capacity" type="number" min="1" step="1" value="${escapeHtml(room.capacity)}" required class="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-gray-600 mb-1">Room Size</label>
            <input name="size" value="${escapeHtml(room.size)}" required class="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
        </div>

        <!-- Landing Card Image (Pure File Upload) -->
        <div class="bg-gray-50 p-4 rounded-xl border space-y-2">
          <label class="block text-xs font-semibold text-gray-700">Property Listing Card Image</label>
          <input type="hidden" name="image" value="${escapeHtml(room.image)}" />
          <div class="flex items-center gap-4">
            <img data-preview-for="image" src="${escapeHtml(room.image)}" alt="Card preview" class="w-24 h-16 object-cover rounded-lg border bg-white flex-shrink-0 shadow-sm" />
            <div class="space-y-1">
              <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-lg shadow-sm transition-colors">
                <span>Upload Card Image</span>
                <input type="file" accept="image/*" class="hidden" data-upload-field="image" data-room-id="${escapeHtml(room.id)}" />
              </label>
              <p data-status-for="image" class="text-[11px] text-gray-500">Stored in Supabase Storage (room-media)</p>
            </div>
          </div>
        </div>

        <!-- Detail Page Main Image (Pure File Upload) -->
        <div class="bg-gray-50 p-4 rounded-xl border space-y-2">
          <label class="block text-xs font-semibold text-gray-700">Property Detail Main Image (Slide 1)</label>
          <input type="hidden" name="mainImage" value="${escapeHtml(room.mainImage)}" />
          <div class="flex items-center gap-4">
            <img data-preview-for="mainImage" src="${escapeHtml(room.mainImage)}" alt="Main preview" class="w-24 h-16 object-cover rounded-lg border bg-white flex-shrink-0 shadow-sm" />
            <div class="space-y-1">
              <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-lg shadow-sm transition-colors">
                <span>Upload Main Image</span>
                <input type="file" accept="image/*" class="hidden" data-upload-field="mainImage" data-room-id="${escapeHtml(room.id)}" />
              </label>
              <p data-status-for="mainImage" class="text-[11px] text-gray-500">First image shown on the Property Detail showcase</p>
            </div>
          </div>
        </div>

        <!-- 360 Panorama Image + Interactive 360 Preview (Pure File Upload) -->
        <div class="md:col-span-2 bg-gray-50 p-4 rounded-xl border space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label class="block text-xs font-semibold text-gray-700">360° Panoramic Viewer (Last Slide on Property Detail)</label>
              <p data-status-for="panorama" class="text-[11px] text-gray-500">Shown as the final interactive 360° slide in the Property Detail left-side thumbnail row.</p>
            </div>
            <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-lg shadow-sm transition-colors">
              <span>Upload 360° Panorama</span>
              <input type="file" accept="image/*" class="hidden" data-upload-field="panorama" data-room-id="${escapeHtml(room.id)}" />
            </label>
          </div>
          <input type="hidden" name="panorama" value="${escapeHtml(room.panorama)}" />
          <div
            data-panorama-preview="${escapeHtml(room.id)}"
            class="w-full h-56 rounded-lg overflow-hidden bg-black relative cursor-grab border"
          ></div>
        </div>

        <!-- Gallery / Slider Images Manager (Pure File Upload) -->
        <div class="md:col-span-2 bg-gray-50 p-4 rounded-xl border space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label class="block text-xs font-semibold text-gray-700">Property Detail Left-Side Thumbnail Row &amp; Slider Gallery</label>
              <p class="text-[11px] text-gray-500">Photos added here appear in the left-side thumbnail rail on the Property Detail page (before the final 360° slide) and in the landing card slider.</p>
            </div>
            <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3.5 py-2 rounded-lg shadow-sm transition-colors">
              <span>+ Upload Gallery Photos</span>
              <input type="file" accept="image/*" multiple class="hidden" data-upload-gallery="${escapeHtml(room.id)}" />
            </label>
          </div>
          <div data-gallery-list="${escapeHtml(room.id)}" class="flex flex-wrap gap-3">
            ${renderGalleryItemsHtml(room.images || [])}
          </div>
        </div>

        <div class="md:col-span-2">
          <label class="block text-xs font-semibold text-gray-600 mb-1">Features (comma-separated)</label>
          <input name="features" value="${escapeHtml((room.features || []).join(', '))}" class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div class="md:col-span-2">
          <label class="block text-xs font-semibold text-gray-600 mb-1">Description</label>
          <textarea name="description" rows="2" class="w-full px-3 py-2 border rounded-lg text-sm">${escapeHtml(room.description)}</textarea>
        </div>
        <div class="md:col-span-2 flex justify-end gap-2">
          <button type="button" data-action="toggle-edit-room" data-room-id="${escapeHtml(room.id)}" class="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">Save to Supabase</button>
        </div>
      </form>
    </div>
  `
    )
    .join('');
}

function initAdminListings() {
  const container = document.getElementById('adminListingsContainer');
  if (!container) return;

  const roomsRef = supabaseData.collection(supabase, 'rooms');
  let seeded = false;

  supabaseData.onSnapshot(
    roomsRef,
    async (snapshot) => {
      const byIdMap = new Map();
      snapshot.forEach((doc) => byIdMap.set(doc.id, doc.data()));

      if (!seeded) {
        seeded = true;
        // Only seed default rooms if the database has zero rooms at all (fresh database setup)
        if (snapshot.size === 0) {
          for (const base of DEFAULT_ROOMS) {
            await supabaseData
              .setDoc(supabaseData.doc(supabase, 'rooms', base.id), { ...base }, { merge: true })
              .catch((err) => console.warn('Room seed skipped:', err));
          }
        }
      }

      const rooms = [];
      snapshot.forEach((doc) => {
        rooms.push(mergeRoomData(doc.id, { id: doc.id, ...doc.data() }));
      });
      currentAdminRooms = rooms;
      renderListings(rooms);
      updateTenantDormSelect(rooms);
    },
    (err) => console.error('Failed to subscribe to admin listings:', err)
  );

  // Modal open/close & Delete room handling
  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-action="open-add-room-modal"]')) {
      document.getElementById('addRoomModal')?.classList.remove('hidden');
      return;
    }

    if (target.closest('[data-action="close-add-room-modal"]')) {
      document.getElementById('addRoomModal')?.classList.add('hidden');
      return;
    }

    const previewBtn = target.closest('button[data-action="preview-room"]');
    if (previewBtn) {
      const roomId = previewBtn.dataset.roomId;
      const room = currentAdminRooms.find((r) => r.id === roomId);
      if (room) openRoomPreviewModal(room);
      return;
    }

    const thumbBtn = target.closest('button[data-preview-thumb-src]');
    if (thumbBtn) {
      const src = thumbBtn.getAttribute('data-preview-thumb-src');
      const mainImg = document.getElementById('previewRoomMainImg');
      if (mainImg && src) mainImg.src = src;
      document.querySelectorAll('.preview-thumb-btn').forEach((b) => {
        b.className = b === thumbBtn
          ? 'preview-thumb-btn relative w-16 h-12 rounded-lg overflow-hidden border-2 border-emerald-500 ring-2 ring-emerald-200 flex-shrink-0 transition-all cursor-pointer'
          : 'preview-thumb-btn relative w-16 h-12 rounded-lg overflow-hidden border-2 border-gray-200 hover:border-gray-400 flex-shrink-0 transition-all cursor-pointer';
      });
      return;
    }

    if (
      target.closest('#closePreviewRoomModalBtn') ||
      target.id === 'previewRoomModal'
    ) {
      closeRoomPreviewModal();
      return;
    }

    const deleteBtn = target.closest('button[data-action="delete-room"]');
    if (deleteBtn) {
      const { roomId, roomName } = deleteBtn.dataset;
      if (!roomId) return;

      const confirmed = await Toast.confirm({
        title: 'Delete Unit Listing',
        message: `Are you sure you want to delete "${roomName || roomId}"? This will permanently remove the unit listing from the website.`,
        confirmText: 'Delete Unit',
        cancelText: 'Cancel',
        danger: true
      });

      if (!confirmed) return;

      try {
        deleteBtn.disabled = true;
        await supabaseData.deleteDoc(supabaseData.doc(supabase, 'rooms', roomId));
        await supabase.from('rooms').delete().eq('id', roomId);
        Toast.success(`Unit "${roomName || roomId}" deleted successfully.`);
      } catch (err) {
        console.error('Failed to delete room:', err);
        Toast.error(`Failed to delete room: ${err.message || 'Unknown error'}`);
        deleteBtn.disabled = false;
      }
    }
  });

  // Create room form submission
  const createRoomForm = document.getElementById('createRoomForm');
  createRoomForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submitCreateRoomBtn');
    const originalBtnText = submitBtn?.innerHTML || 'Create Listing';

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Creating Unit...';
      }

      const fd = new FormData(createRoomForm);
      const name = (fd.get('name') || '').toString().trim();
      const type = (fd.get('type') || '').toString().trim();
      const price = Number(fd.get('price'));
      const capacity = Number(fd.get('capacity'));
      const available = Number(fd.get('available'));
      const size = (fd.get('size') || '').toString().trim();
      const badge = (fd.get('badge') || '').toString().trim();
      const features = (fd.get('features') || '')
        .toString()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const description = (fd.get('description') || '').toString().trim();

      if (!name || !type || !price || !capacity || !size) {
        Toast.error('Please fill in all required unit fields.');
        return;
      }

      const slug = normalizeRoomDocId(name);
      const fileInput = document.getElementById('addRoomImageInput');
      const file = fileInput?.files?.[0];

      let imageUrl = 'assets/img/triple-occupancy-panorama.png';
      if (file) {
        try {
          imageUrl = await uploadRoomFile(slug, file, 'image');
        } catch (uploadErr) {
          console.warn('Image upload failed, using fallback:', uploadErr);
        }
      }

      const newRoom = {
        id: slug,
        name,
        type,
        price,
        capacity,
        available,
        size,
        badge: badge || null,
        features: features.length ? features : ['1 Room', 'Bathroom'],
        description: description || `Modern ${type} with comfortable living spaces.`,
        image: imageUrl,
        mainImage: imageUrl,
        panorama: imageUrl,
        images: [imageUrl]
      };

      await supabaseData.setDoc(supabaseData.doc(supabase, 'rooms', slug), newRoom);
      Toast.success(`Unit "${name}" created and published!`);
      createRoomForm.reset();
      document.getElementById('addRoomModal')?.classList.add('hidden');
    } catch (err) {
      console.error('Failed to create room:', err);
      Toast.error(`Failed to create room: ${err.message || 'Unknown error'}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    }
  });

  container.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const removeBtn = target.closest('button[data-action="remove-gallery-image"]');
    if (removeBtn) {
      removeBtn.closest('[data-gallery-item]')?.remove();
      return;
    }

    const btn = target.closest('button[data-action="toggle-edit-room"]');
    if (!btn) return;
    const roomId = btn.dataset.roomId;
    const form = container.querySelector(`form[data-room-edit-form="${roomId}"]`);
    if (!form) return;
    const isNowHidden = form.classList.toggle('hidden');
    if (!isNowHidden) {
      const panoInput = form.querySelector('input[name="panorama"]');
      const panoBox = form.querySelector(`[data-panorama-preview="${roomId}"]`);
      if (panoInput?.value && panoBox) {
        mountAdminPanoramaPreview(panoBox, panoInput.value.trim());
      }
    }
  });

  container.addEventListener('change', async (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input) return;

    if (input.dataset.uploadField && input.files?.length) {
      const fieldName = input.dataset.uploadField;
      const roomId = input.dataset.roomId;
      const file = input.files[0];
      const form = input.closest('form[data-room-edit-form]');
      if (!form || !file) return;

      const statusEl = form.querySelector(`[data-status-for="${fieldName}"]`);
      try {
        if (statusEl) statusEl.textContent = `Uploading ${file.name}...`;
        const publicUrl = await uploadRoomFile(roomId, file, fieldName);
        const hiddenInput = form.querySelector(`input[name="${fieldName}"]`);
        if (hiddenInput) hiddenInput.value = publicUrl;
        const previewImg = form.querySelector(`img[data-preview-for="${fieldName}"]`);
        if (previewImg) previewImg.src = publicUrl;
        if (fieldName === 'panorama') {
          const panoBox = form.querySelector(`[data-panorama-preview="${roomId}"]`);
          mountAdminPanoramaPreview(panoBox, publicUrl);
        }
        if (statusEl) statusEl.textContent = `Uploaded: ${file.name} (click Save to publish)`;
        Toast.success('Uploaded to Supabase Storage! Click "Save to Supabase" to publish.');
      } catch (err) {
        console.error('Supabase Storage upload failed:', err);
        if (statusEl) statusEl.textContent = 'Upload failed.';
        Toast.error(`Upload failed: ${err.message || 'Check Storage RLS policies'}`);
      } finally {
        input.value = '';
      }
      return;
    }

    if (input.dataset.uploadGallery && input.files?.length) {
      const roomId = input.dataset.uploadGallery;
      const files = Array.from(input.files);
      const form = input.closest('form[data-room-edit-form]');
      const galleryList = form?.querySelector(`[data-gallery-list="${roomId}"]`);
      if (!form || !galleryList) return;

      try {
        Toast.success(`Uploading ${files.length} image(s) to Supabase...`);
        const existingUrls = Array.from(
          form.querySelectorAll('input[name="galleryImage"]')
        ).map((el) => el.value);
        for (const file of files) {
          const url = await uploadRoomFile(roomId, file, 'gallery');
          existingUrls.push(url);
        }
        galleryList.innerHTML = renderGalleryItemsHtml(existingUrls);
        Toast.success('Gallery images uploaded! Click "Save to Supabase" to publish.');
      } catch (err) {
        console.error('Gallery upload failed:', err);
        Toast.error(`Gallery upload failed: ${err.message || 'Unknown error'}`);
      } finally {
        input.value = '';
      }
    }
  });

  container.addEventListener('submit', async (event) => {
    const form =
      event.target instanceof HTMLFormElement && event.target.dataset.roomEditForm
        ? event.target
        : null;
    if (!form) return;
    event.preventDefault();

    const roomId = form.dataset.roomEditForm;
    const fd = new FormData(form);
    const galleryImages = fd
      .getAll('galleryImage')
      .map((v) => v.toString().trim())
      .filter(Boolean);

    const updated = mergeRoomData(roomId, {
      id: roomId,
      name: fd.get('name')?.toString().trim(),
      type: fd.get('type')?.toString().trim(),
      price: Number(fd.get('price')),
      badge: fd.get('badge')?.toString().trim(),
      available: Number(fd.get('available')),
      capacity: Number(fd.get('capacity')),
      size: fd.get('size')?.toString().trim(),
      image: fd.get('image')?.toString().trim(),
      mainImage: fd.get('mainImage')?.toString().trim(),
      panorama: fd.get('panorama')?.toString().trim(),
      images: galleryImages,
      features: fd.get('features')?.toString(),
      description: fd.get('description')?.toString().trim()
    });

    try {
      await supabaseData.setDoc(supabaseData.doc(supabase, 'rooms', roomId), updated, {
        merge: true
      });
      Toast.success(`Saved "${updated.name}" to Supabase`);
    } catch (error) {
      console.error('Failed to save listing:', error);
      Toast.error(`Failed to save listing: ${error.message || 'Unknown error'}`);
    }
  });
}

function initAdminPaymentCalendar() {
  const section = document.getElementById('adminPaymentCalendarSection');
  const gridEl = document.getElementById('adminCalendarGrid');
  const monthLabelEl = document.getElementById('adminCalendarMonthLabel');
  const filterSelect = document.getElementById('adminCalendarTenantFilter');
  const detailEl = document.getElementById('adminCalendarDayDetail');
  const upcomingEl = document.getElementById('adminUpcomingScheduleList');
  const dueTableBody = document.getElementById('adminPaymentDueTableBody');
  if (!section || !gridEl || !monthLabelEl) return;

  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth();
  let selectedDateKey = '';
  let tenantFilter = '';
  let calTenants = [];
  let calPayments = [];

  const badgeStyle = (status) => {
    if (status === 'Paid') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (status === 'Overdue' || status === 'Failed')
      return 'bg-red-100 text-red-800 border-red-200';
    if (status === 'Scheduled') return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-amber-100 text-amber-800 border-amber-200';
  };

  const renderCalendar = () => {
    const cal = buildPaymentCalendar({
      tenants: calTenants,
      payments: calPayments,
      year: calYear,
      month: calMonth,
      tenantFilter
    });

    monthLabelEl.textContent = cal.monthLabel;

    const expectedEl = document.getElementById('adminPaymentExpected');
    const paidEl = document.getElementById('adminPaymentPaid');
    const overdueEl = document.getElementById('adminPaymentOverdue');
    if (expectedEl) expectedEl.textContent = formatPHP(cal.monthSummary.totalExpected);
    if (paidEl) paidEl.textContent = formatPHP(cal.monthSummary.totalPaid);
    if (overdueEl) overdueEl.textContent = formatPHP(cal.monthSummary.totalOverdue);

    // Current Month Collection Statistics Chart
    const collectionBadge = document.getElementById('adminPaymentCollectionRateBadge');
    if (collectionBadge) {
      collectionBadge.textContent = `${cal.monthSummary.collectionRate}% Collected`;
    }

    const totalExp = cal.monthSummary.totalExpected || 0;
    const paidAmt = cal.monthSummary.totalPaid || 0;
    const overdueAmt = cal.monthSummary.totalOverdue || 0;
    const pendingAmt = cal.monthSummary.totalPending || 0;

    const pctPaid =
      totalExp > 0 ? Math.min(100, Math.round((paidAmt / totalExp) * 100)) : paidAmt > 0 ? 100 : 0;
    const pctOverdue =
      totalExp > 0 ? Math.min(100 - pctPaid, Math.round((overdueAmt / totalExp) * 100)) : 0;
    const pctPending = totalExp > 0 ? Math.max(0, 100 - pctPaid - pctOverdue) : 0;

    const barPaid = document.getElementById('adminStatBarPaid');
    const barPending = document.getElementById('adminStatBarPending');
    const barOverdue = document.getElementById('adminStatBarOverdue');
    if (barPaid) barPaid.style.width = `${pctPaid}%`;
    if (barPending) barPending.style.width = `${pctPending}%`;
    if (barOverdue) barOverdue.style.width = `${pctOverdue}%`;

    const labelPaid = document.getElementById('adminStatLabelPaid');
    const labelPending = document.getElementById('adminStatLabelPending');
    const labelOverdue = document.getElementById('adminStatLabelOverdue');
    if (labelPaid) labelPaid.textContent = formatPHP(paidAmt);
    if (labelPending) labelPending.textContent = formatPHP(pendingAmt);
    if (labelOverdue) labelOverdue.textContent = formatPHP(overdueAmt);

    const statPctPaid = document.getElementById('adminStatPctPaid');
    const statPctPending = document.getElementById('adminStatPctPending');
    const statPctOverdue = document.getElementById('adminStatPctOverdue');
    if (statPctPaid) statPctPaid.textContent = `${pctPaid}%`;
    if (statPctPending) statPctPending.textContent = `${pctPending}%`;
    if (statPctOverdue) statPctOverdue.textContent = `${pctOverdue}%`;

    const roomBreakdownEl = document.getElementById('adminStatRoomBreakdown');
    if (roomBreakdownEl) {
      if (!cal.monthSummary.roomBreakdown || !cal.monthSummary.roomBreakdown.length) {
        roomBreakdownEl.innerHTML =
          '<span class="text-gray-400 italic">No room allocations active for this month</span>';
      } else {
        roomBreakdownEl.innerHTML = cal.monthSummary.roomBreakdown
          .map((rb) => {
            const rmPct =
              rb.expected > 0 ? Math.min(100, Math.round((rb.paid / rb.expected) * 100)) : 0;
            return `<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 border text-xs">
              <span class="font-bold text-gray-800">${escapeHtml(rb.room)}:</span>
              <span class="text-emerald-700 font-semibold">${escapeHtml(formatPHP(rb.paid))}</span>
              <span class="text-gray-400">/</span>
              <span class="text-gray-600">${escapeHtml(formatPHP(rb.expected))}</span>
              <span class="text-[10px] text-gray-500 font-medium bg-white px-1.5 py-0.5 rounded border">(${rmPct}%)</span>
            </div>`;
          })
          .join('');
      }
    }

    // 6-Month Sales & Revenue Forecast
    const forecast = buildSalesForecast({
      tenants: calTenants,
      monthsAhead: 6,
      today: new Date(calYear, calMonth, 1)
    });

    const runRateEl = document.getElementById('adminForecastRunRate');
    const inflowEl = document.getElementById('adminForecastTotalInflow');
    const activeTenantsEl = document.getElementById('adminForecastActiveTenants');
    if (runRateEl) runRateEl.textContent = formatPHP(forecast.monthlyRunRate);
    if (inflowEl) inflowEl.textContent = formatPHP(forecast.totalProjectedInflow);
    if (activeTenantsEl) {
      activeTenantsEl.textContent = `${forecast.activeTenantCount} Active ${forecast.activeTenantCount === 1 ? 'Contract' : 'Contracts'}`;
    }

    const forecastChartEl = document.getElementById('adminSalesForecastChart');
    if (forecastChartEl) {
      forecastChartEl.innerHTML = forecast.projectedMonths
        .map((m) => {
          const heightPct =
            forecast.maxProjected > 0
              ? Math.max(12, Math.round((m.projectedAmount / forecast.maxProjected) * 100))
              : 12;
          const isCurr = m.isCurrentMonth;
          const barBg = isCurr
            ? 'bg-gradient-to-t from-emerald-600 to-emerald-400 border-emerald-500'
            : 'bg-gradient-to-t from-blue-600 to-blue-400 border-blue-500';
          const cardBg = isCurr
            ? 'bg-emerald-50/40 border-emerald-200'
            : 'bg-gray-50/70 border-gray-200';
          const badgeText = isCurr
            ? 'Current Month'
            : `${m.tenantCount} ${m.tenantCount === 1 ? 'Contract' : 'Contracts'}`;

          return `
            <div class="flex flex-col items-center justify-between p-3 rounded-xl border ${cardBg} transition-all hover:shadow-sm">
              <div class="text-[11px] font-bold text-gray-700 uppercase tracking-tight text-center mb-2">${escapeHtml(m.label)}</div>
              
              <!-- Vertical Forecast Column Container -->
              <div class="w-full h-32 flex items-end justify-center py-1">
                <div class="w-9/12 rounded-t-lg border-t border-x transition-all duration-700 shadow-sm flex items-start justify-center pt-1.5 ${barBg}" style="height: ${heightPct}%">
                  <span class="text-[9px] font-extrabold text-white leading-none drop-shadow">₱</span>
                </div>
              </div>

              <div class="text-center mt-2 w-full">
                <div class="text-xs font-extrabold text-gray-900">${escapeHtml(formatPHP(m.projectedAmount))}</div>
                <div class="text-[10px] text-gray-500 mt-0.5 truncate">${escapeHtml(badgeText)}</div>
              </div>
            </div>`;
        })
        .join('');
    }

    gridEl.innerHTML = cal.days
      .map((cell) => {
        const baseCls = [
          'min-h-[82px] border rounded-lg p-1.5 flex flex-col gap-1 cursor-pointer transition-colors'
        ];
        if (!cell.inCurrentMonth) baseCls.push('bg-gray-50 opacity-45');
        else baseCls.push('bg-white hover:bg-gray-50');
        if (cell.isToday) baseCls.push('ring-2 ring-emerald-500 border-emerald-500');
        if (cell.dateKey === selectedDateKey) baseCls.push('ring-2 ring-blue-600 bg-blue-50/40');

        const dueHtml = cell.dueEvents
          .slice(0, 3)
          .map((ev) => {
            if (ev.isMoveInMarker) {
              return `<div class="text-[10px] font-semibold px-1.5 py-0.5 rounded border truncate bg-amber-50 text-amber-900 border-amber-200" title="Scheduled Move-in: ${escapeHtml(ev.tenantName)} (${escapeHtml(ev.room)})">📦 ${escapeHtml(ev.tenantName)}: Move-In</div>`;
            }
            const prefix =
              ev.status === 'Paid'
                ? '✓'
                : ev.status === 'Overdue'
                  ? '!'
                  : ev.status === 'Scheduled'
                    ? '📅'
                    : '•';
            return `<div class="text-[10px] font-semibold px-1.5 py-0.5 rounded border truncate ${badgeStyle(ev.status)}" title="${escapeHtml(ev.tenantName)} (${escapeHtml(ev.room)}) - ${escapeHtml(formatPHP(ev.amount))} [${escapeHtml(ev.status)}]">${prefix} ${escapeHtml(ev.tenantName)}: ${escapeHtml(formatPHP(ev.amount))}</div>`;
          })
          .join('');

        const payHtml = cell.paymentEvents
          .slice(0, 2)
          .map(
            (p) =>
              `<div class="text-[10px] font-semibold px-1.5 py-0.5 rounded border truncate ${badgeStyle(p.status)}" title="Payment by ${escapeHtml(p.tenantName)}: ${escapeHtml(formatPHP(p.amount))} (${escapeHtml(p.status)})">💳 ${escapeHtml(p.tenantName)}: ${escapeHtml(formatPHP(p.amount))}</div>`
          )
          .join('');

        const extraCount =
          Math.max(0, cell.dueEvents.length - 3) + Math.max(0, cell.paymentEvents.length - 2);
        const moreHtml =
          extraCount > 0
            ? `<div class="text-[10px] text-gray-500 font-medium">+${extraCount} more</div>`
            : '';

        return `
          <div class="${baseCls.join(' ')}" data-action="admin-cal-select-day" data-date-key="${escapeHtml(cell.dateKey)}">
            <div class="text-xs font-bold text-gray-700">${cell.dayNumber}</div>
            ${dueHtml}
            ${payHtml}
            ${moreHtml}
          </div>`;
      })
      .join('');

    if (detailEl) {
      const selectedCell = cal.days.find((d) => d.dateKey === selectedDateKey);
      if (selectedCell && (selectedCell.dueEvents.length || selectedCell.paymentEvents.length)) {
        const lines = [
          ...selectedCell.dueEvents.map((ev) => {
            if (ev.isMoveInMarker) {
              return `
                <div class="flex items-center justify-between py-2 border-b last:border-b-0 gap-2 flex-wrap sm:flex-nowrap">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-base flex-shrink-0">📦</span>
                    <div class="min-w-0">
                      <div class="text-sm font-bold text-gray-900 truncate">${escapeHtml(ev.tenantName)}</div>
                      <div class="text-xs text-amber-800 font-medium">${escapeHtml(ev.room)} • Scheduled Move-In</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                    <button type="button" data-action="extend-move-in" data-id="${attr(ev.tenantId)}" data-name="${attr(ev.tenantName)}" class="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors" title="Extend move-in date by +1 day">
                      +1 Day Extend
                    </button>
                    <button type="button" data-action="reschedule-move-in" data-id="${attr(ev.tenantId)}" data-name="${attr(ev.tenantName)}" class="px-2 py-1 text-xs font-semibold bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors" title="Pick a new move-in date">
                      Reschedule
                    </button>
                    <button type="button" data-action="complete-move-in" data-id="${attr(ev.tenantId)}" data-name="${attr(ev.tenantName)}" class="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors" title="Mark tenant as moved in and clear schedule marker">
                      ✓ Moved In
                    </button>
                    <button type="button" data-action="remove-move-in" data-id="${attr(ev.tenantId)}" data-name="${attr(ev.tenantName)}" class="px-2 py-1 text-xs font-semibold text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove move-in schedule">
                      ✕
                    </button>
                  </div>
                </div>`;
            }
            return `<div class="flex items-center justify-between py-1 border-b last:border-b-0">
              <span><strong>${escapeHtml(ev.tenantName)}</strong> (${escapeHtml(ev.room)}) — Scheduled Rent Due</span>
              <span class="px-2 py-0.5 rounded text-xs font-semibold border ${badgeStyle(ev.status)}">${escapeHtml(ev.status)} • ${escapeHtml(formatPHP(ev.amount))}</span>
            </div>`;
          }),
          ...selectedCell.paymentEvents.map(
            (p) =>
              `<div class="flex items-center justify-between py-1 border-b last:border-b-0">
                <span><strong>${escapeHtml(p.tenantName)}</strong> — ${escapeHtml(p.purpose)} (${escapeHtml(p.referenceNumber || p.method)})</span>
                <span class="px-2 py-0.5 rounded text-xs font-semibold border ${badgeStyle(p.status)}">Payment ${escapeHtml(p.status)} • ${escapeHtml(formatPHP(p.amount))}</span>
              </div>`
          )
        ].join('');
        detailEl.classList.remove('hidden');
        detailEl.innerHTML = `<div class="font-bold text-gray-900 mb-2">Events on ${escapeHtml(selectedCell.dateKey)}</div><div class="space-y-1">${lines}</div>`;
      } else {
        detailEl.classList.add('hidden');
        detailEl.innerHTML = '';
      }
    }

    if (upcomingEl) {
      if (!cal.upcomingSchedule.length) {
        upcomingEl.innerHTML =
          '<p class="text-xs text-gray-400 italic">No upcoming unpaid tenant schedules found.</p>';
      } else {
        upcomingEl.innerHTML = cal.upcomingSchedule
          .map(
            (item) => `
            <div class="p-3 rounded-lg border bg-gray-50 flex items-center justify-between gap-2">
              <div>
                <div class="text-xs font-bold text-gray-900">${escapeHtml(item.tenantName)} • ${escapeHtml(item.room)}</div>
                <div class="text-xs text-gray-600">${escapeHtml(item.dueDate)} — <strong>${escapeHtml(formatPHP(item.amount))}</strong></div>
              </div>
              <span class="px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeStyle(item.status === 'Due Soon' ? 'Pending' : item.status)}">${escapeHtml(item.status)}</span>
            </div>`
          )
          .join('');
      }
    }

    if (dueTableBody) {
      if (!cal.monthSummary.rows.length) {
        dueTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="px-6 py-8 text-center text-sm text-gray-500">
              No tenant payment schedules found for this month.
            </td>
          </tr>`;
      } else {
        dueTableBody.innerHTML = cal.monthSummary.rows
          .map((row) => {
            const payload = encodeURIComponent(
              JSON.stringify({
                id: row.tenantId,
                name: row.tenantName,
                email: row.tenantEmail,
                room: row.room,
                amount: row.amount,
                dueDay: row.dueDay,
                dueDate: row.dueDate,
                status: row.status
              })
            );
            const pillCls =
              row.status === 'Paid'
                ? 'bg-green-100 text-green-800'
                : row.status === 'Overdue'
                  ? 'bg-red-100 text-red-800'
                  : row.status === 'Scheduled'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-yellow-100 text-yellow-800';
            return `
              <tr>
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-semibold text-sm mr-3">
                      ${escapeHtml(initials(row.tenantName))}
                    </div>
                    <div class="text-sm font-medium text-gray-900">${escapeHtml(row.tenantName)}</div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${escapeHtml(row.room)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">${escapeHtml(formatPHP(row.amount))}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${escapeHtml(row.dueDate)}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${pillCls}">${escapeHtml(row.status)}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                  <button data-open-modal="payment" data-tenant="${payload}" class="text-blue-600 hover:text-blue-800 mr-3">
                    View Payment
                  </button>
                  <button data-open-modal="dueDate" data-tenant="${payload}" class="text-green-600 hover:text-green-800">
                    View Due Date
                  </button>
                </td>
              </tr>`;
          })
          .join('');
      }
    }
  };

  const syncTenantDropdown = () => {
    if (!filterSelect) return;
    const prev = filterSelect.value;
    filterSelect.innerHTML =
      '<option value="">All Tenants</option>' +
      calTenants
        .map(
          (t) =>
            `<option value="${escapeHtml(t.email || t.id)}">${escapeHtml(t.name || 'Tenant')} (${escapeHtml(t.room || 'Unassigned')})</option>`
        )
        .join('');
    filterSelect.value = prev;
  };

  supabaseData.onSnapshot(
    supabaseData.collection(supabase, 'tenants'),
    (snap) => {
      calTenants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      syncTenantDropdown();
      renderCalendar();
    },
    (err) => console.error('Calendar tenants listener failed:', err)
  );

  supabaseData.onSnapshot(
    supabaseData.collection(supabase, 'payments'),
    (snap) => {
      calPayments = deduplicatePayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      renderCalendar();
    },
    (err) => console.error('Calendar payments listener failed:', err)
  );

  filterSelect?.addEventListener('change', () => {
    tenantFilter = filterSelect.value;
    renderCalendar();
  });

  section.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const btn = target?.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'admin-cal-prev':
        calMonth -= 1;
        if (calMonth < 0) {
          calMonth = 11;
          calYear -= 1;
        }
        renderCalendar();
        break;
      case 'admin-cal-next':
        calMonth += 1;
        if (calMonth > 11) {
          calMonth = 0;
          calYear += 1;
        }
        renderCalendar();
        break;
      case 'admin-cal-today':
        calYear = new Date().getFullYear();
        calMonth = new Date().getMonth();
        selectedDateKey = '';
        renderCalendar();
        break;
      case 'admin-cal-select-day':
        selectedDateKey = btn.dataset.dateKey || '';
        renderCalendar();
        break;
      case 'extend-move-in': {
        const tenantId = btn.dataset.id;
        const tenant = calTenants.find(
          (t) => t.id === tenantId || t.email === tenantId || t.name === tenantId
        );
        if (!tenant || !tenant.id) {
          Toast.error('Tenant record not found.');
          return;
        }
        const currentMoveIn = tenant.moveInDate ? new Date(tenant.moveInDate) : new Date();
        const nextDate = new Date(currentMoveIn);
        nextDate.setDate(nextDate.getDate() + 1);
        const newDateStr = nextDate.toISOString().split('T')[0];
        try {
          await supabaseData.updateDoc(supabaseData.doc(supabase, 'tenants', tenant.id), {
            moveInDate: newDateStr,
            updatedAt: supabaseData.serverTimestamp()
          });
          selectedDateKey = '';
          Toast.success(`Extended ${tenant.name}'s move-in date to ${newDateStr}.`);
        } catch (err) {
          console.error('Failed to extend move-in date:', err);
          Toast.error('Could not extend move-in: ' + (err.message || 'Unknown error'));
        }
        break;
      }
      case 'reschedule-move-in': {
        const tenantId = btn.dataset.id;
        const tenant = calTenants.find(
          (t) => t.id === tenantId || t.email === tenantId || t.name === tenantId
        );
        if (!tenant || !tenant.id) {
          Toast.error('Tenant record not found.');
          return;
        }
        const inputVal = await Toast.prompt({
          title: 'Reschedule Move-in Date',
          message: `Enter new move-in date for ${tenant.name} (YYYY-MM-DD):`,
          placeholder: tenant.moveInDate || new Date().toISOString().split('T')[0],
          confirmText: 'Save Date'
        });
        if (!inputVal) return;
        const parsed = new Date(inputVal);
        if (Number.isNaN(parsed.getTime())) {
          Toast.error('Please enter a valid date in YYYY-MM-DD format.');
          return;
        }
        const newDateStr = parsed.toISOString().split('T')[0];
        try {
          await supabaseData.updateDoc(supabaseData.doc(supabase, 'tenants', tenant.id), {
            moveInDate: newDateStr,
            updatedAt: supabaseData.serverTimestamp()
          });
          selectedDateKey = '';
          Toast.success(`Rescheduled ${tenant.name}'s move-in to ${newDateStr}.`);
        } catch (err) {
          console.error('Failed to reschedule move-in date:', err);
          Toast.error('Could not reschedule: ' + (err.message || 'Unknown error'));
        }
        break;
      }
      case 'complete-move-in': {
        const tenantId = btn.dataset.id;
        const tenant = calTenants.find(
          (t) => t.id === tenantId || t.email === tenantId || t.name === tenantId
        );
        if (!tenant || !tenant.id) {
          Toast.error('Tenant record not found.');
          return;
        }
        try {
          await supabaseData.updateDoc(supabaseData.doc(supabase, 'tenants', tenant.id), {
            movedIn: true,
            updatedAt: supabaseData.serverTimestamp()
          });
          selectedDateKey = '';
          Toast.success(`Marked ${tenant.name} as moved in. Move-in schedule cleared from calendar.`);
        } catch (err) {
          console.error('Failed to mark moved in:', err);
          Toast.error('Could not update status: ' + (err.message || 'Unknown error'));
        }
        break;
      }
      case 'remove-move-in': {
        const tenantId = btn.dataset.id;
        const tenant = calTenants.find(
          (t) => t.id === tenantId || t.email === tenantId || t.name === tenantId
        );
        if (!tenant || !tenant.id) {
          Toast.error('Tenant record not found.');
          return;
        }
        const ok = await Toast.confirm({
          title: 'Remove Move-in Schedule?',
          message: `Remove the scheduled move-in marker for ${tenant.name} from the calendar?`,
          confirmText: 'Remove Schedule',
          cancelText: 'Cancel'
        });
        if (!ok) return;
        try {
          await supabaseData.updateDoc(supabaseData.doc(supabase, 'tenants', tenant.id), {
            movedIn: true,
            updatedAt: supabaseData.serverTimestamp()
          });
          selectedDateKey = '';
          Toast.success(`Removed move-in schedule for ${tenant.name}.`);
        } catch (err) {
          console.error('Failed to remove move-in schedule:', err);
          Toast.error('Could not remove schedule: ' + (err.message || 'Unknown error'));
        }
        break;
      }
      default:
        break;
    }
  });

  renderCalendar();
}

function formatTimeAgo(rawDate) {
  const ts = rawDate ? new Date(rawDate).getTime() : NaN;
  if (!Number.isFinite(ts)) return 'Recently';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function initAdminOverviewActivity() {
  const listEl = document.getElementById('adminRecentActivityList');
  if (!listEl) return;

  const state = {
    tenants: [],
    reservations: [],
    messages: [],
    payments: []
  };

  const renderActivity = () => {
    const events = [];

    for (const t of state.tenants) {
      const time = new Date(t.createdAt || t.moveInDate || 0).getTime() || 0;
      events.push({
        time,
        rawDate: t.createdAt || t.moveInDate,
        type: 'tenant',
        tab: 'tenants',
        title: `Tenant account enrolled: ${t.name || 'Tenant'}`,
        subtitle: `${t.room || 'Unassigned'} • ${formatTimeAgo(t.createdAt || t.moveInDate)}`
      });
    }

    for (const p of state.payments) {
      const raw = p.createdAt || p.paidAt || p.dateFormatted;
      const time = new Date(raw || 0).getTime() || 0;
      const isPaid = String(p.status || '').toLowerCase() === 'paid';
      events.push({
        time,
        rawDate: raw,
        type: isPaid ? 'tenant' : 'reservation',
        tab: 'tenant-payments',
        title: `Payment ${p.status || 'Recorded'} (${formatPHP(Number(p.amount) || 0)})`,
        subtitle: `${p.tenantName || p.tenantEmail || 'Tenant'} • ${formatTimeAgo(raw)}`
      });
    }

    for (const r of state.reservations) {
      const raw = r.decisionAt || r.createdAt;
      const time = new Date(raw || 0).getTime() || 0;
      events.push({
        time,
        rawDate: raw,
        type: r.status === 'Approved' ? 'tenant' : 'reservation',
        tab: 'reservations',
        title:
          r.status === 'Approved'
            ? `Booking confirmed for ${r.name || 'Guest'}`
            : `Reservation request (${r.status || 'Pending'})`,
        subtitle: `${r.room || 'Room'} • ${formatTimeAgo(raw)}`
      });
    }

    for (const m of state.messages) {
      if (m.sender === 'admin') continue;
      const raw = m.createdAt;
      const time = new Date(raw || 0).getTime() || 0;
      const isTenant = m.sender === 'tenant';
      events.push({
        time,
        rawDate: raw,
        type: 'message',
        tab: isTenant ? 'tenant-messages' : 'messages',
        title: isTenant ? 'New tenant message received' : 'New public inquiry received',
        subtitle: `From ${m.name || m.email || 'Visitor'} • ${formatTimeAgo(raw)}`
      });
    }

    events.sort((a, b) => b.time - a.time);
    const topEvents = events.slice(0, 6);

    if (!topEvents.length) {
      listEl.innerHTML =
        '<p class="text-sm text-gray-500 py-6 text-center">No recent activity yet. New tenants, reservations, payments, and messages will appear here automatically.</p>';
      return;
    }

    listEl.innerHTML = topEvents
      .map((ev, idx) => {
        const borderCls = idx < topEvents.length - 1 ? 'pb-4 border-b' : '';
        let iconHtml;
        if (ev.type === 'tenant') {
          iconHtml = `
            <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
              </svg>
            </div>`;
        } else if (ev.type === 'reservation') {
          iconHtml = `
            <div class="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>`;
        } else {
          iconHtml = `
            <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
              </svg>
            </div>`;
        }

        return `
          <button type="button" data-tab-button="${escapeHtml(ev.tab)}" class="w-full text-left flex items-start gap-3 ${borderCls} hover:bg-gray-50/80 rounded-lg p-1.5 -m-1.5 transition-colors">
            ${iconHtml}
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">${escapeHtml(ev.title)}</p>
              <p class="text-xs text-gray-500 truncate">${escapeHtml(ev.subtitle)}</p>
            </div>
          </button>`;
      })
      .join('');
  };

  for (const col of ['tenants', 'reservations', 'messages', 'payments']) {
    supabaseData.onSnapshot(
      supabaseData.collection(supabase, col),
      (snap) => {
        const rawItems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        state[col] = col === 'payments' ? deduplicatePayments(rawItems) : rawItems;
        renderActivity();
      },
      (err) => console.warn(`Overview activity listener (${col}) failed:`, err)
    );
  }
}

function initAdminBuilding3D() {
  const viewport = document.getElementById('adminBuilding3DViewport');
  if (!viewport) return;

  let viewer = null;
  let tenantsList = [];
  let selectedUnitId = 'Room 201';
  let xrayEnabled = true;
  let spinEnabled = true;

  const getOccupantsForUnit = (unitId) =>
    tenantsList.filter((t) => {
      const resolved = resolveBuildingUnit(t.room, t.dormName);
      return resolved && resolved.id === unitId;
    });

  const renderInspector = () => {
    const unit = BUILDING_UNITS.find((u) => u.id === selectedUnitId) || BUILDING_UNITS[0];
    if (!unit) return;

    const occupants = getOccupantsForUnit(unit.id);
    const isOccupied = occupants.length > 0;

    const statusBadge = document.getElementById('admin3DUnitStatusBadge');
    if (statusBadge) {
      statusBadge.textContent = isOccupied
        ? `● Occupied (${occupants.length})`
        : '○ Vacant Unit';
      statusBadge.className = isOccupied
        ? 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800'
        : 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800';
    }

    const floorBadge = document.getElementById('admin3DUnitFloorBadge');
    if (floorBadge) floorBadge.textContent = `${unit.floorLabel} • ${unit.wing}`;

    const titleEl = document.getElementById('admin3DUnitTitle');
    if (titleEl) titleEl.textContent = unit.id;

    const typeEl = document.getElementById('admin3DUnitType');
    if (typeEl) typeEl.textContent = `${unit.type} • ${unit.size}`;

    const occEl = document.getElementById('admin3DUnitOccupancy');
    if (occEl) {
      occEl.textContent =
        unit.type === 'Commercial Space'
          ? `${occupants.length} / 1 Lease`
          : `${occupants.length} / ${unit.capacity} Occupants`;
    }

    const priceEl = document.getElementById('admin3DUnitPrice');
    if (priceEl) priceEl.textContent = `${formatPHP(unit.price)}/mo`;

    const tenantsEl = document.getElementById('admin3DUnitTenantsList');
    if (tenantsEl) {
      if (!occupants.length) {
        tenantsEl.innerHTML =
          '<p class="text-xs text-gray-400 italic py-1">No active tenants assigned to this unit yet.</p>';
      } else {
        tenantsEl.innerHTML = occupants
          .map(
            (t) => `
          <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-emerald-50/70 border border-emerald-200">
            <div class="min-w-0">
              <div class="font-bold text-gray-900 truncate">${escapeHtml(t.name || 'Tenant')}</div>
              <div class="text-[11px] text-gray-500 truncate">${escapeHtml(t.email || '')} • ${escapeHtml(t.room || unit.id)}</div>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white text-emerald-700 border border-emerald-200 flex-shrink-0">
              ${escapeHtml(formatPHP(Number(t.monthlyRent) || unit.price))}
            </span>
          </div>`
          )
          .join('');
      }
    }

    const featsEl = document.getElementById('admin3DUnitFeatures');
    if (featsEl) {
      featsEl.innerHTML = (unit.features || [])
        .map(
          (f) =>
            `<span class="px-2 py-1 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">${escapeHtml(f)}</span>`
        )
        .join('');
    }

    const dirEl = document.getElementById('admin3DUnitDirectory');
    if (dirEl) {
      dirEl.innerHTML = BUILDING_UNITS.map((u) => {
        const uOcc = getOccupantsForUnit(u.id);
        const active = u.id === unit.id;
        return `
          <button type="button" data-action="admin-3d-select-unit" data-unit-id="${escapeHtml(u.id)}"
            class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left text-xs transition-colors ${active
            ? 'bg-emerald-50 border-emerald-500 text-gray-900 font-bold'
            : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
          }">
            <div>
              <span class="font-bold text-gray-900">${escapeHtml(u.id)}</span>
              <span class="text-gray-500 ml-1">${escapeHtml(u.floorLabel)} (${escapeHtml(u.wing)})</span>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold ${uOcc.length > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
          }">
              ${u.type === 'Commercial Space'
            ? uOcc.length > 0
              ? 'Leased'
              : 'Available'
            : `${uOcc.length}/${u.capacity} Beds`
          }
            </span>
          </button>`;
      }).join('');
    }
  };

  const ensureViewer = () => {
    if (!viewer) {
      viewer = initBuilding3DViewer(viewport, {
        mode: 'admin',
        tenants: tenantsList,
        onSelectUnit: (unit) => {
          selectedUnitId = unit.id;
          renderInspector();
        }
      });
      viewer.selectUnit(selectedUnitId);
    } else {
      viewer.resize();
      viewer.setTenants(tenantsList);
    }
    renderInspector();
  };

  supabaseData.onSnapshot(
    supabaseData.collection(supabase, 'tenants'),
    (snap) => {
      tenantsList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (viewer) viewer.setTenants(tenantsList);
      renderInspector();
    },
    (err) => console.warn('3D Building tenants listener error:', err)
  );

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const tabBtn = target.closest('[data-tab-button="building-3d"]');
    if (tabBtn) {
      setTimeout(ensureViewer, 50);
      return;
    }

    const actionBtn = target.closest('[data-action]');
    if (!actionBtn) return;

    switch (actionBtn.dataset.action) {
      case 'admin-3d-xray':
        ensureViewer();
        xrayEnabled = !xrayEnabled;
        if (viewer) viewer.setXrayMode(xrayEnabled);
        actionBtn.textContent = xrayEnabled ? 'X-Ray Mode: ON' : 'X-Ray Mode: OFF';
        actionBtn.className = xrayEnabled
          ? 'px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-700 text-white border border-emerald-700 hover:bg-emerald-800 transition-colors'
          : 'px-3.5 py-2 rounded-lg text-xs font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors';
        break;
      case 'admin-3d-spin':
        ensureViewer();
        spinEnabled = !spinEnabled;
        if (viewer) viewer.setAutoRotate(spinEnabled);
        actionBtn.textContent = spinEnabled ? 'Auto-Spin: ON' : 'Auto-Spin: OFF';
        actionBtn.className = spinEnabled
          ? 'px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-800 text-white border border-slate-800 hover:bg-slate-900 transition-colors'
          : 'px-3.5 py-2 rounded-lg text-xs font-semibold bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors';
        break;
      case 'admin-3d-reset': {
        ensureViewer();
        xrayEnabled = true;
        spinEnabled = true;
        if (viewer) {
          viewer.setXrayMode(true);
          viewer.setAutoRotate(true);
          viewer.setFloorFilter('all');
          viewer.resetCamera();
        }
        const xrayBtn = document.getElementById('admin3DXrayBtn');
        if (xrayBtn) {
          xrayBtn.textContent = 'X-Ray Mode: ON';
          xrayBtn.className =
            'px-3.5 py-2 rounded-lg text-xs font-bold bg-emerald-700 text-white border border-emerald-700 hover:bg-emerald-800 transition-colors';
        }
        const spinBtn = document.getElementById('admin3DSpinBtn');
        if (spinBtn) {
          spinBtn.textContent = 'Auto-Spin: ON';
          spinBtn.className =
            'px-3.5 py-2 rounded-lg text-xs font-bold bg-slate-800 text-white border border-slate-800 hover:bg-slate-900 transition-colors';
        }
        document.querySelectorAll('[data-action="admin-3d-floor"]').forEach((pill) => {
          pill.className =
            pill.dataset.floor === 'all'
              ? 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-900 text-sky-400 border border-sky-500'
              : 'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200';
        });
        break;
      }
      case 'admin-3d-floor': {
        ensureViewer();
        const floor = actionBtn.dataset.floor || 'all';
        if (viewer) viewer.setFloorFilter(floor);
        document.querySelectorAll('[data-action="admin-3d-floor"]').forEach((pill) => {
          pill.className =
            pill.dataset.floor === floor
              ? 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-900 text-sky-400 border border-sky-500'
              : 'px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200';
        });
        break;
      }
      case 'admin-3d-select-unit': {
        ensureViewer();
        const unitId = actionBtn.dataset.unitId || '';
        if (unitId) {
          selectedUnitId = unitId;
          if (viewer) viewer.selectUnit(unitId);
        }
        break;
      }
      default:
        break;
    }
  });
}

guardPage({
  role: 'admin',
  redirectTo: 'login.html',
  grantedEvent: 'admin-access-granted'
});

initLogoutButtons();
initBackButtonGuard('admin');
initDetailModals();

// Realtime listeners are bound only once the guard passes -- binding them for
// an anonymous visitor would attempt to read tenant PII.
document.addEventListener(
  'admin-access-granted',
  () => {
    initTenantTable();
    initCreateTenant();
    listenToTenants();
    initAdminListings();
    initAdminPaymentCalendar();
    initAdminOverviewActivity();
    initAdminBuilding3D();
  },
  { once: true }
);
