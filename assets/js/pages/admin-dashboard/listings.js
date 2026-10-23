/**
 * Admin dashboard apartment listings management.
 * Supports adding, editing, viewing, and deleting apartment listings.
 */

import { escapeHtml } from '../../lib/format.js';
import { Toast } from '../../render/toast.js';

const STORAGE_KEY = 'homespot_apartment_listings';

const DEFAULT_LISTINGS = [
  {
    id: 'listing-1',
    title: 'Single Occupancy Room',
    type: 'Single Occupancy',
    price: 5500,
    capacity: 4,
    occupied: 2,
    status: 'Active',
    image: 'assets/img/triple-occupancy.jpg',
    features: 'Aircon Space, Private Bathroom, High-speed WiFi',
    description: 'Cozy single occupancy unit designed for students or working professionals.'
  },
  {
    id: 'listing-2',
    title: 'Double Occupancy Room',
    type: 'Double Occupancy',
    price: 4000,
    capacity: 6,
    occupied: 3,
    status: 'Active',
    image: 'assets/img/triple-occupancy.jpg',
    features: 'Aircon Space, Shared Bathroom, Study Desks',
    description: 'Spacious double occupancy unit with good natural ventilation and natural lighting.'
  },
  {
    id: 'listing-3',
    title: 'Triple Occupancy Room',
    type: 'Triple Occupancy',
    price: 3200,
    capacity: 12,
    occupied: 4,
    status: 'Active',
    image: 'assets/img/triple-occupancy.jpg',
    features: '3 People, Bathroom, Aircon Space, Lockers',
    description: 'Affordable triple sharing room with built-in storage lockers and private bathroom.'
  },
  {
    id: 'listing-4',
    title: 'Commercial Space',
    type: 'Commercial Space',
    price: 12000,
    capacity: 4,
    occupied: 1,
    status: 'Active',
    image: 'assets/img/commercial-space.jpg',
    features: 'Ground Floor, Private Restroom, High Foot Traffic',
    description: 'Prime commercial unit ideal for small business, boutique office, or retail outlet.'
  }
];

export function getListings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_LISTINGS));
      return [...DEFAULT_LISTINGS];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_LISTINGS];
  } catch (error) {
    console.error('Failed to read listings from localStorage:', error);
    return [...DEFAULT_LISTINGS];
  }
}

export function saveListings(listings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
  } catch (error) {
    console.error('Failed to save listings to localStorage:', error);
  }
}

export function renderAdminListings() {
  const container = document.getElementById('adminListingsContainer');
  if (!container) return;

  const listings = getListings();

  // Update total listings in stats if available
  const totalCountEl = document.getElementById('totalListingsCount');
  if (totalCountEl) totalCountEl.textContent = listings.length;

  if (listings.length === 0) {
    container.innerHTML = `
      <div class="bg-white border rounded-lg p-8 text-center text-gray-500">
        <p class="text-base font-semibold text-gray-700 mb-1">No apartment listings found.</p>
        <p class="text-sm text-gray-500 mb-4">Click "Add New Listing" to create your first listing.</p>
        <button data-action="open-add-listing" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
          Add New Listing
        </button>
      </div>`;
    return;
  }

  container.innerHTML = listings
    .map((item) => {
      const statusBadge =
        item.status === 'Active'
          ? '<span class="bg-green-100 text-green-800 text-xs px-2.5 py-0.5 rounded-full font-semibold">Active</span>'
          : item.status === 'Maintenance'
            ? '<span class="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-semibold">Maintenance</span>'
            : '<span class="bg-red-100 text-red-800 text-xs px-2.5 py-0.5 rounded-full font-semibold">Fully Booked</span>';

      const priceFormatted = Number(item.price || 0).toLocaleString();
      const imageSrc = item.image || 'assets/img/triple-occupancy.jpg';

      return `
      <div class="bg-white border rounded-xl p-5 shadow-sm hover:shadow-md transition-all" data-listing-card="${escapeHtml(item.id)}">
        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(item.title)}" class="w-24 h-24 object-cover rounded-xl border border-gray-100 shadow-sm flex-shrink-0" />
            <div>
              <div class="flex items-center gap-2.5 mb-1.5 flex-wrap">
                <h4 class="text-lg font-bold text-gray-900">${escapeHtml(item.title)}</h4>
                ${statusBadge}
                <span class="text-xs bg-blue-50 text-blue-700 font-medium px-2 py-0.5 rounded">${escapeHtml(item.type || 'Room')}</span>
              </div>
              <div class="flex items-center gap-4 text-sm text-gray-600 mb-2 flex-wrap">
                <span>Occupancy: <strong class="text-gray-900">${escapeHtml(item.occupied || 0)}/${escapeHtml(item.capacity || 1)}</strong></span>
                <span>•</span>
                <span class="text-emerald-600 font-bold text-base">₱${priceFormatted}/mo</span>
              </div>
              <p class="text-xs text-gray-500 line-clamp-1 max-w-xl">${escapeHtml(item.features || item.description || '')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 self-end md:self-center">
            <button
              data-action="edit-listing"
              data-id="${escapeHtml(item.id)}"
              class="px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-blue-300 transition-colors flex items-center gap-1.5"
            >
              <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
              Edit
            </button>
            <button
              data-action="view-listing-detail"
              data-id="${escapeHtml(item.id)}"
              class="px-3.5 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-blue-300 transition-colors flex items-center gap-1.5"
            >
              <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              View
            </button>
            <button
              data-action="delete-listing"
              data-id="${escapeHtml(item.id)}"
              class="px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors"
              title="Delete Listing"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
          </div>
        </div>
      </div>`;
    })
    .join('');
}

export function openAddListingModal() {
  const modal = document.getElementById('listingModal');
  const form = document.getElementById('listingForm');
  if (!modal || !form) return;

  form.reset();
  const idInput = document.getElementById('listingModalId');
  if (idInput) idInput.value = '';

  const titleEl = document.getElementById('listingModalTitle');
  if (titleEl) titleEl.textContent = 'Add New Apartment Listing';

  modal.classList.remove('hidden');
}

export function openEditListingModal(id) {
  const modal = document.getElementById('listingModal');
  const form = document.getElementById('listingForm');
  if (!modal || !form) return;

  const listings = getListings();
  const item = listings.find((l) => l.id === id);
  if (!item) {
    Toast.error('Listing not found');
    return;
  }

  const idInput = document.getElementById('listingModalId');
  if (idInput) idInput.value = item.id;

  const titleEl = document.getElementById('listingModalTitle');
  if (titleEl) titleEl.textContent = 'Edit Apartment Listing';

  const titleInput = document.getElementById('listingTitleInput');
  if (titleInput) titleInput.value = item.title || '';

  const typeInput = document.getElementById('listingTypeInput');
  if (typeInput) typeInput.value = item.type || 'Single Occupancy';

  const priceInput = document.getElementById('listingPriceInput');
  if (priceInput) priceInput.value = item.price || 0;

  const capacityInput = document.getElementById('listingCapacityInput');
  if (capacityInput) capacityInput.value = item.capacity || 1;

  const occupiedInput = document.getElementById('listingOccupiedInput');
  if (occupiedInput) occupiedInput.value = item.occupied || 0;

  const statusInput = document.getElementById('listingStatusInput');
  if (statusInput) statusInput.value = item.status || 'Active';

  const imageInput = document.getElementById('listingImageInput');
  if (imageInput) imageInput.value = item.image || 'assets/img/triple-occupancy.jpg';

  const featuresInput = document.getElementById('listingFeaturesInput');
  if (featuresInput) featuresInput.value = item.features || '';

  const descInput = document.getElementById('listingDescInput');
  if (descInput) descInput.value = item.description || '';

  modal.classList.remove('hidden');
}

export function closeListingModal() {
  const modal = document.getElementById('listingModal');
  if (modal) modal.classList.add('hidden');
}

export function handleListingFormSubmit(event) {
  event.preventDefault();
  const id = document.getElementById('listingModalId')?.value.trim();
  const title = document.getElementById('listingTitleInput')?.value.trim();
  const type = document.getElementById('listingTypeInput')?.value;
  const price = Number(document.getElementById('listingPriceInput')?.value || 0);
  const capacity = Number(document.getElementById('listingCapacityInput')?.value || 1);
  const occupied = Number(document.getElementById('listingOccupiedInput')?.value || 0);
  const status = document.getElementById('listingStatusInput')?.value || 'Active';
  const image = document.getElementById('listingImageInput')?.value || 'assets/img/triple-occupancy.jpg';
  const features = document.getElementById('listingFeaturesInput')?.value.trim();
  const description = document.getElementById('listingDescInput')?.value.trim();

  if (!title || price <= 0) {
    Toast.error('Please enter a valid listing title and price');
    return;
  }

  const listings = getListings();

  if (id) {
    // Edit existing listing
    const index = listings.findIndex((l) => l.id === id);
    if (index !== -1) {
      listings[index] = {
        ...listings[index],
        title,
        type,
        price,
        capacity,
        occupied,
        status,
        image,
        features,
        description
      };
      saveListings(listings);
      Toast.success(`Listing "${title}" updated successfully!`);
    }
  } else {
    // Add new listing
    const newListing = {
      id: `listing-${Date.now()}`,
      title,
      type,
      price,
      capacity,
      occupied,
      status,
      image,
      features,
      description
    };
    listings.unshift(newListing);
    saveListings(listings);
    Toast.success(`New listing "${title}" added successfully!`);
  }

  closeListingModal();
  renderAdminListings();
}

export function deleteListing(id) {
  const listings = getListings();
  const target = listings.find((l) => l.id === id);
  const title = target ? target.title : 'listing';

  if (!confirm(`Are you sure you want to delete "${title}"?`)) {
    return;
  }

  const updated = listings.filter((l) => l.id !== id);
  saveListings(updated);
  Toast.success(`Listing "${title}" deleted.`);
  renderAdminListings();
}

export function viewListingDetail(id) {
  const listings = getListings();
  const item = listings.find((l) => l.id === id);
  if (!item) return;

  const modal = document.getElementById('viewListingModal');
  if (!modal) return;

  const titleEl = document.getElementById('viewListingTitle');
  if (titleEl) titleEl.textContent = item.title;

  const priceEl = document.getElementById('viewListingPrice');
  if (priceEl) priceEl.textContent = `₱${Number(item.price).toLocaleString()}/month`;

  const typeEl = document.getElementById('viewListingType');
  if (typeEl) typeEl.textContent = item.type;

  const occupancyEl = document.getElementById('viewListingOccupancy');
  if (occupancyEl) occupancyEl.textContent = `${item.occupied} occupied / ${item.capacity} total`;

  const statusEl = document.getElementById('viewListingStatus');
  if (statusEl) statusEl.textContent = item.status;

  const featuresEl = document.getElementById('viewListingFeatures');
  if (featuresEl) featuresEl.textContent = item.features || 'None';

  const descEl = document.getElementById('viewListingDesc');
  if (descEl) descEl.textContent = item.description || 'No description provided.';

  const imgEl = document.getElementById('viewListingImage');
  if (imgEl) imgEl.src = item.image || 'assets/img/triple-occupancy.jpg';

  modal.classList.remove('hidden');
}

export function closeViewListingModal() {
  document.getElementById('viewListingModal')?.classList.add('hidden');
}

export function initAdminListings() {
  renderAdminListings();

  const form = document.getElementById('listingForm');
  if (form) {
    form.addEventListener('submit', handleListingFormSubmit);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-action="open-add-listing"]')) {
      openAddListingModal();
      return;
    }

    const editBtn = target.closest('[data-action="edit-listing"]');
    if (editBtn) {
      const id = editBtn.dataset.id;
      if (id) openEditListingModal(id);
      return;
    }

    const viewBtn = target.closest('[data-action="view-listing-detail"]');
    if (viewBtn) {
      const id = viewBtn.dataset.id;
      if (id) viewListingDetail(id);
      return;
    }

    const deleteBtn = target.closest('[data-action="delete-listing"]');
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      if (id) deleteListing(id);
      return;
    }

    if (target.closest('[data-action="close-listing-modal"]')) {
      closeListingModal();
      return;
    }

    if (target.closest('[data-action="close-view-listing-modal"]')) {
      closeViewListingModal();
      return;
    }

    // Quick Action button in Overview: "Add New Listing"
    if (target.closest('[data-action="quick-add-listing"]')) {
      // Switch to listings tab and open add listing modal
      document.querySelector('[data-tab-button="listings"]')?.click();
      setTimeout(() => openAddListingModal(), 150);
    }
  });
}
