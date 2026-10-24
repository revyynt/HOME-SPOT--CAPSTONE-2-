/**
 * Public forms: "Inquire Now" and "Reserve Apartment" (index.html and
 * property-detail.html).
 *
 * Both write the field sets allowed by the Supabase RLS policies.
 */

import {
  supabaseData,
  getMessagesRef,
  getReservationsRef,
  isDataReady,
  waitForSupabaseReady
} from '../supabase-service.js';
import { getUrlParam } from '../lib/format.js';
import { Toast } from '../render/toast.js';

/**
 * The room this page is about.
 * @returns {string}
 */
export function getRoomNameFromPage() {
  const el = document.getElementById('roomName');
  const liveName = el?.textContent.trim();
  if (liveName && liveName !== 'Loading...') return liveName;

  const roomId = getUrlParam('id');
  if (roomId === '1') return 'Triple Occupancy Room';
  if (roomId === '4') return 'Commercial Space';

  return 'Triple Occupancy Room';
}

async function ensureSupabase(timeout = 7000) {
  if (isDataReady()) return true;
  const ready = await waitForSupabaseReady(timeout);
  if (!ready) {
    Toast.error('Supabase is not ready. Please refresh the page and try again.');
    return false;
  }
  return true;
}

/** Reads and validates the shared name/email/phone fields. */
function readCommonFields(form) {
  return {
    name: form.querySelector('[name="name"]')?.value.trim() ?? '',
    email: form.querySelector('[name="email"]')?.value.trim() ?? '',
    phone: form.querySelector('[name="phone"]')?.value.trim() ?? ''
  };
}

function hidePanel(id) {
  document.getElementById(id)?.classList.add('hidden');
}

/**
 * @param {SubmitEvent} event
 */
async function handleInquirySubmit(event) {
  event.preventDefault();
  const form = event.target;

  const { name, email, phone } = readCommonFields(form);
  if (!name || !email || !phone) {
    Toast.error('Please fill in all required fields');
    return;
  }

  const messagesRef = getMessagesRef();
  if (!(await ensureSupabase()) || !messagesRef) {
    Toast.error('Unable to submit inquiry. Please refresh the page and try again.');
    return;
  }

  // Strictly constrained to the 8 keys whitelisted by the anonymous Supabase insert RLS policy:
  // ['name', 'email', 'phone', 'room', 'moveInDate', 'message', 'status', 'createdAt']
  const isCustomerSupport = Boolean(form.querySelector('[name="subject"]')) || !window.location.pathname.includes('property-detail');
  const room = isCustomerSupport ? 'Customer Support' : getRoomNameFromPage();
  const subjectVal = form.querySelector('[name="subject"]')?.value?.trim();
  const rawMsg = form.querySelector('[name="message"]')?.value?.trim() || '';
  const message = subjectVal ? `[${subjectVal}] ${rawMsg}` : rawMsg;
  const inquiry = {
    name,
    email,
    phone,
    room,
    moveInDate: form.querySelector('[name="moveInDate"]')?.value || null,
    message,
    status: 'New',
    createdAt: supabaseData.serverTimestamp()
  };

  try {
    await supabaseData.addDoc(messagesRef, inquiry);
    Toast.success("Support inquiry sent successfully! Our team will contact you soon.");
  } catch (error) {
    console.error('Supabase inquiry submit failed:', error);
    Toast.error('Unable to submit inquiry. Please try again.');
    return;
  }

  form.reset();
  hidePanel('inquiryForm');
}

/**
 * @param {SubmitEvent} event
 */
/**
 * Compresses an image file to a JPEG data URL.
 * Scales to max 1200px and quality 0.8 to keep payload compact (~80-120KB)
 * while preserving high legibility for text/photos on ID cards.
 *
 * @param {File} file
 * @param {number} [maxDimension]
 * @param {number} [quality]
 * @returns {Promise<string>}
 */
export async function compressImageToDataUrl(file, maxDimension = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleReservationSubmit(event) {
  event.preventDefault();
  const form = event.target;

  const { name, email, phone } = readCommonFields(form);
  if (!name || !email || !phone) {
    Toast.error('Please fill in all required fields');
    return;
  }

  const fileInput = form.querySelector('[name="validId"]');
  const validIdFile = fileInput?.files?.[0];
  if (!validIdFile) {
    Toast.error('Please upload a clear photo of your valid ID');
    return;
  }

  const reservationsRef = getReservationsRef();
  if (!(await ensureSupabase()) || !reservationsRef) {
    Toast.error('Unable to submit reservation. Please refresh the page and try again.');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = 'Processing ID & Submitting...';
  }

  let compressedValidId;
  try {
    compressedValidId = await compressImageToDataUrl(validIdFile);
  } catch (err) {
    console.error('Valid ID compression failed:', err);
    Toast.error('Unable to process the uploaded ID. Please try another image.');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
    return;
  }

  const notes = form.querySelector('[name="additionalInfo"]')?.value.trim() || '';
  const additionalInfoPayload = JSON.stringify({
    notes,
    validId: compressedValidId
  });

  // Field set is constrained by the anonymous Supabase insert policy.
  const reservation = {
    name,
    email,
    phone,
    room: getRoomNameFromPage(),
    moveInDate: form.querySelector('[name="moveInDate"]')?.value || null,
    message: form.querySelector('[name="message"]')?.value.trim() || null,
    additionalInfo: additionalInfoPayload,
    status: 'Pending',
    createdAt: supabaseData.serverTimestamp()
  };

  try {
    await supabaseData.addDoc(reservationsRef, reservation);
    Toast.success(
      'Reservation request submitted! The admin will review your valid ID and contact you.'
    );
  } catch (error) {
    console.error('Supabase reservation submit failed:', error);
    Toast.error('Unable to submit reservation. Please try again.');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnHtml;
  }

  form.reset();
  const resetBtn = document.getElementById('validIdRemoveBtn');
  resetBtn?.click();
  hidePanel('reservationForm');
}

/** Shows the inquiry panel, hiding the reservation panel. */
export function toggleInquiryForm() {
  document.getElementById('inquiryForm')?.classList.toggle('hidden');
  hidePanel('reservationForm');
}

/** Shows the reservation panel, hiding the inquiry panel. */
export function toggleReservationForm() {
  document.getElementById('reservationForm')?.classList.toggle('hidden');
  hidePanel('inquiryForm');
}

/**
 * Delegates the modal open/close controls.
 *
 * These used to be inline `onclick="toggleInquiryForm()"` attributes, two of
 * which read the legacy `event` global for backdrop clicks. Backdrop clicks
 * cannot be expressed as a plain delegated click (the target check needs the
 * listener's own element), so the overlay gets its own listener.
 */
export function initPublicFormToggles() {
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('#inquireBtn')) {
      toggleInquiryForm();
      return;
    }
    if (target.closest('#reserveBtn')) {
      toggleReservationForm();
      return;
    }
    if (target.closest('[data-close="inquiryForm"]')) {
      hidePanel('inquiryForm');
      return;
    }
    if (target.closest('[data-close="reservationForm"]')) {
      hidePanel('reservationForm');
    }
  });

  // Backdrop clicks: only when the overlay itself was hit.
  for (const id of ['inquiryForm', 'reservationForm']) {
    const overlay = document.getElementById(id);
    overlay?.addEventListener('click', (event) => {
      if (event.target === overlay) hidePanel(id);
    });
  }
}

/**
 * Binds the public forms if they exist on the current page.
 */
/**
 * Handles the Valid ID file picker preview and reset in the reservation modal.
 */
function initValidIdUploader() {
  const fileInput = document.getElementById('reservationValidId');
  const preview = document.getElementById('validIdPreview');
  const placeholder = document.getElementById('validIdPlaceholder');
  const meta = document.getElementById('validIdMeta');
  const filenameEl = document.getElementById('validIdFilename');
  const removeBtn = document.getElementById('validIdRemoveBtn');

  if (!fileInput) return;

  const resetUploader = () => {
    fileInput.value = '';
    if (preview) {
      preview.src = '';
      preview.classList.add('hidden');
    }
    placeholder?.classList.remove('hidden');
    meta?.classList.add('hidden');
    meta?.classList.remove('flex');
    if (filenameEl) filenameEl.textContent = '';
  };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      resetUploader();
      return;
    }

    if (!file.type.startsWith('image/')) {
      Toast.error('Please select an image file (PNG, JPG, or WEBP).');
      resetUploader();
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      Toast.error('Image file is too large. Please select an image under 10MB.');
      resetUploader();
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    if (preview) {
      preview.src = objectUrl;
      preview.classList.remove('hidden');
    }
    placeholder?.classList.add('hidden');
    if (filenameEl) filenameEl.textContent = file.name;
    if (meta) {
      meta.classList.remove('hidden');
      meta.classList.add('flex');
    }
  });

  removeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    resetUploader();
  });
}

export function initPublicForms() {
  const inquiryForm = document.getElementById('inquiryFormElement');
  if (inquiryForm) inquiryForm.addEventListener('submit', handleInquirySubmit);

  const reservationForm = document.getElementById('reservationFormElement');
  if (reservationForm) reservationForm.addEventListener('submit', handleReservationSubmit);

  initPublicFormToggles();
  initValidIdUploader();
}
