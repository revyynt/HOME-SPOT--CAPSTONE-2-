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
import { DEFAULT_ROOMS, formatRoomPrice, mergeRoomData } from '../lib/rooms.js';
import { escapeHtml, formatPHP, initials } from '../lib/format.js';
import { buildPaymentCalendar } from '../lib/payment-calendar.js';
import { Toast } from '../render/toast.js';

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
            class="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium"
          >
            Edit
          </button>
          <a
            href="property-detail.html?id=${encodeURIComponent(room.detailId || room.id)}"
            class="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium text-gray-700"
          >
            View
          </a>
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
          <label class="block text-xs font-semibold text-gray-700">Property Detail Main Image</label>
          <input type="hidden" name="mainImage" value="${escapeHtml(room.mainImage)}" />
          <div class="flex items-center gap-4">
            <img data-preview-for="mainImage" src="${escapeHtml(room.mainImage)}" alt="Main preview" class="w-24 h-16 object-cover rounded-lg border bg-white flex-shrink-0 shadow-sm" />
            <div class="space-y-1">
              <label class="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-lg shadow-sm transition-colors">
                <span>Upload Main Image</span>
                <input type="file" accept="image/*" class="hidden" data-upload-field="mainImage" data-room-id="${escapeHtml(room.id)}" />
              </label>
              <p data-status-for="mainImage" class="text-[11px] text-gray-500">Stored in Supabase Storage (room-media)</p>
            </div>
          </div>
        </div>

        <!-- 360 Panorama Image + Interactive 360 Preview (Pure File Upload) -->
        <div class="md:col-span-2 bg-gray-50 p-4 rounded-xl border space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <label class="block text-xs font-semibold text-gray-700">360° Panoramic Viewer</label>
              <p data-status-for="panorama" class="text-[11px] text-gray-500">Upload an equirectangular 360° photo to Supabase Storage and drag below to test.</p>
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
              <label class="block text-xs font-semibold text-gray-700">Property Listing Gallery Images (for Slider)</label>
              <p class="text-[11px] text-gray-500">Upload one or multiple photos directly to Supabase Storage.</p>
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
        for (const base of DEFAULT_ROOMS) {
          const existing = byIdMap.get(base.id);
          if (!existing || existing.price === undefined || !existing.image) {
            const merged = mergeRoomData(base, existing);
            await supabaseData
              .setDoc(supabaseData.doc(supabase, 'rooms', base.id), merged, { merge: true })
              .catch((err) => console.warn('Room seed skipped:', err));
          }
        }
      }

      const rooms = DEFAULT_ROOMS.map((base) => mergeRoomData(base, byIdMap.get(base.id)));
      renderListings(rooms);
    },
    (err) => console.error('Failed to subscribe to admin listings:', err)
  );

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
          ...selectedCell.dueEvents.map(
            (ev) =>
              `<div class="flex items-center justify-between py-1 border-b last:border-b-0">
                <span><strong>${escapeHtml(ev.tenantName)}</strong> (${escapeHtml(ev.room)}) — Scheduled Rent Due</span>
                <span class="px-2 py-0.5 rounded text-xs font-semibold border ${badgeStyle(ev.status)}">${escapeHtml(ev.status)} • ${escapeHtml(formatPHP(ev.amount))}</span>
              </div>`
          ),
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

    if (dueTableBody && cal.monthSummary.rows.length > 0) {
      dueTableBody.innerHTML = cal.monthSummary.rows
        .map((row) => {
          const payload = encodeURIComponent(
            JSON.stringify({
              name: row.tenantName,
              room: row.room,
              amount: row.amount,
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
      calPayments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderCalendar();
    },
    (err) => console.error('Calendar payments listener failed:', err)
  );

  filterSelect?.addEventListener('change', () => {
    tenantFilter = filterSelect.value;
    renderCalendar();
  });

  section.addEventListener('click', (event) => {
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
      default:
        break;
    }
  });

  renderCalendar();
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
  },
  { once: true }
);
