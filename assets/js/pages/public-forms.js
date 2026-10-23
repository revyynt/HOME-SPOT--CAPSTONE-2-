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
  const roomName = getRoomNameFromPage();
  const subjectVal = form.querySelector('[name="subject"]')?.value?.trim();
  const rawMsg = form.querySelector('[name="message"]')?.value?.trim() || '';
  const message = subjectVal ? `[${subjectVal}] ${rawMsg}` : rawMsg;
  const inquiry = {
    name,
    email,
    phone,
    room: roomName || 'Customer Support',
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
async function handleReservationSubmit(event) {
  event.preventDefault();
  const form = event.target;

  const { name, email, phone } = readCommonFields(form);
  if (!name || !email || !phone) {
    Toast.error('Please fill in all required fields');
    return;
  }

  const reservationsRef = getReservationsRef();
  if (!(await ensureSupabase()) || !reservationsRef) {
    Toast.error('Unable to submit reservation. Please refresh the page and try again.');
    return;
  }

  // Field set is constrained by the anonymous Supabase insert policy.
  const reservation = {
    name,
    email,
    phone,
    room: getRoomNameFromPage(),
    moveInDate: form.querySelector('[name="moveInDate"]')?.value || null,
    message: form.querySelector('[name="message"]')?.value.trim() || null,
    additionalInfo: form.querySelector('[name="additionalInfo"]')?.value.trim() || null,
    status: 'Pending',
    createdAt: supabaseData.serverTimestamp()
  };

  try {
    await supabaseData.addDoc(reservationsRef, reservation);
    Toast.success(
      'Reservation request submitted! The admin will review your request and contact you.'
    );
  } catch (error) {
    console.error('Supabase reservation submit failed:', error);
    Toast.error('Unable to submit reservation. Please try again.');
    return;
  }

  form.reset();
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
export function initPublicForms() {
  const inquiryForm = document.getElementById('inquiryFormElement');
  if (inquiryForm) inquiryForm.addEventListener('submit', handleInquirySubmit);

  const reservationForm = document.getElementById('reservationFormElement');
  if (reservationForm) reservationForm.addEventListener('submit', handleReservationSubmit);

  initPublicFormToggles();
}
