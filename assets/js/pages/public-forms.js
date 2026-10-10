/**
 * Public forms: "Inquire Now" and "Reserve Apartment" (index.html and
 * property-detail.html).
 *
 * Both write to Firestore with the exact field set that firestore.rules
 * permits. The rules use `hasOnly`, so adding a field here without updating
 * firestore.rules will make the write fail.
 */

import {
  firebaseFirestore,
  getMessagesRef,
  getReservationsRef,
  isFirestoreReady,
  waitForFirebaseReady
} from '../firebase-service.js';
import { getUrlParam } from '../lib/format.js';
import { Toast } from '../render/toast.js';

/**
 * The room this page is about.
 * @returns {string}
 */
export function getRoomNameFromPage() {
  const roomId = getUrlParam('id');
  if (roomId === '1') return 'Triple Occupancy Room';
  if (roomId === '4') return 'Commercial Space';

  const el = document.getElementById('roomName');
  if (el && el.textContent.trim()) return el.textContent.trim();

  return 'Triple Occupancy Room';
}

async function ensureFirestore(timeout = 7000) {
  if (isFirestoreReady()) return true;
  const ready = await waitForFirebaseReady(timeout);
  if (!ready) {
    Toast.error('Firebase is not ready. Please refresh the page and try again.');
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
  if (!(await ensureFirestore()) || !messagesRef) {
    Toast.error('Unable to submit inquiry. Please refresh the page and try again.');
    return;
  }

  // Field set pinned by firestore.rules for the anonymous create path.
  const inquiry = {
    name,
    email,
    phone,
    room: getRoomNameFromPage(),
    moveInDate: form.querySelector('[name="moveInDate"]')?.value || null,
    message: form.querySelector('[name="message"]')?.value.trim() || null,
    status: 'New',
    createdAt: firebaseFirestore.serverTimestamp()
  };

  try {
    await firebaseFirestore.addDoc(messagesRef, inquiry);
    Toast.success("Inquiry sent successfully! We'll contact you soon.");
  } catch (error) {
    console.error('Firestore inquiry submit failed:', error);
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
  if (!(await ensureFirestore()) || !reservationsRef) {
    Toast.error('Unable to submit reservation. Please refresh the page and try again.');
    return;
  }

  // Field set pinned by firestore.rules for reservations.create.
  const reservation = {
    name,
    email,
    phone,
    room: getRoomNameFromPage(),
    moveInDate: form.querySelector('[name="moveInDate"]')?.value || null,
    message: form.querySelector('[name="message"]')?.value.trim() || null,
    additionalInfo: form.querySelector('[name="additionalInfo"]')?.value.trim() || null,
    status: 'Pending',
    createdAt: firebaseFirestore.serverTimestamp()
  };

  try {
    await firebaseFirestore.addDoc(reservationsRef, reservation);
    Toast.success(
      'Reservation request submitted! The admin will review your request and contact you.'
    );
  } catch (error) {
    console.error('Firestore reservation submit failed:', error);
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
