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
import { escapeHtml } from '../lib/format.js';
import { Toast } from '../render/toast.js';

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
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Landing Card Image URL / Path</label>
          <input name="image" value="${escapeHtml(room.image)}" required class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">Detail Page Main Image URL / Path</label>
          <input name="mainImage" value="${escapeHtml(room.mainImage)}" required class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1">360° Panorama Image URL / Path</label>
          <input name="panorama" value="${escapeHtml(room.panorama)}" required class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
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
    const btn =
      event.target instanceof Element
        ? event.target.closest('button[data-action="toggle-edit-room"]')
        : null;
    if (!btn) return;
    const form = container.querySelector(`form[data-room-edit-form="${btn.dataset.roomId}"]`);
    form?.classList.toggle('hidden');
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
  },
  { once: true }
);
