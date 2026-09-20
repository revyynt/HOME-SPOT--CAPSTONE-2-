// DORMKAYA Main JavaScript

// Toast notification system
const Toast = {
  container: null,
  
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  
  show(message, type = 'success') {
    this.init();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' 
      ? '<svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>'
      : '<svg class="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>';
    
    toast.innerHTML = `
      ${icon}
      <span>${message}</span>
    `;
    
    this.container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },
  
  success(message) {
    this.show(message, 'success');
  },
  
  error(message) {
    this.show(message, 'error');
  }
};

const FirestoreHelpers = {
  db: null,
  api: null,
};

function updateFirestoreHelpers() {
  if (typeof window !== 'undefined') {
    FirestoreHelpers.db = window.firebaseDb || FirestoreHelpers.db;
    FirestoreHelpers.api = window.firebaseFirestore || FirestoreHelpers.api;
  }
}

function hasFirestore() {
  updateFirestoreHelpers();
  return FirestoreHelpers.db && FirestoreHelpers.api;
}

function waitForFirebaseReady(timeout = 5000) {
  return new Promise((resolve) => {
    if (window.firebaseReady) {
      resolve(true);
      return;
    }

    let timer = setTimeout(() => {
      window.removeEventListener('firebase-ready', onReady);
      resolve(false);
    }, timeout);

    const onReady = () => {
      clearTimeout(timer);
      resolve(true);
    };

    window.addEventListener('firebase-ready', onReady, { once: true });
  });
}

function normalizeRoomDocId(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function getReservationsRef() {
  updateFirestoreHelpers();
  return hasFirestore() ? FirestoreHelpers.api.collection(FirestoreHelpers.db, 'reservations') : null;
}

function getMessagesRef() {
  updateFirestoreHelpers();
  return hasFirestore() ? FirestoreHelpers.api.collection(FirestoreHelpers.db, 'messages') : null;
}

function getRoomRef(roomName) {
  if (!hasFirestore() || !roomName) return null;
  const roomId = normalizeRoomDocId(roomName);
  return FirestoreHelpers.api.doc(FirestoreHelpers.db, 'rooms', roomId);
}

async function updateIndexRoomAvailability() {
  await waitForFirebaseReady();
  if (!hasFirestore()) return;

  const rooms = [
    { name: 'Triple Occupancy Room', badgeId: 'tripleAvailabilityBadge', defaultAvailable: 3 },
    { name: 'Commercial Space', badgeId: 'commercialAvailabilityBadge', defaultAvailable: 1 },
  ];

  function renderBadge(badgeElement, availableCount) {
    if (!badgeElement) return;
    badgeElement.innerHTML = `
      <span class="w-2 h-2 bg-white rounded-full animate-ping absolute"></span>
      <span class="w-2 h-2 bg-white rounded-full relative"></span>
      ${availableCount} Available
    `;
  }

  for (const { name, badgeId, defaultAvailable } of rooms) {
    const badge = document.getElementById(badgeId);
    if (!badge) continue;

    const roomRef = getRoomRef(name);
    if (!roomRef) continue;

    try {
      let roomSnap = await FirestoreHelpers.api.getDoc(roomRef);
      if (!roomSnap.exists()) {
        await FirestoreHelpers.api.setDoc(roomRef, {
          name,
          available: defaultAvailable,
        });
        roomSnap = await FirestoreHelpers.api.getDoc(roomRef);
      }

      if (roomSnap.exists()) {
        const data = roomSnap.data();
        if (typeof data.available === 'number') {
          renderBadge(badge, data.available);
        }
      }

      FirestoreHelpers.api.onSnapshot(roomRef, (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        if (typeof data.available === 'number') {
          renderBadge(badge, data.available);
        }
      });
    } catch (error) {
      console.error('Failed to update room availability badge:', name, error);
    }
  }
}

// Global presentation helper to change room availability live
window.setRoomAvailability = async function(roomNameOrCount, maybeCount) {
  let roomName = 'Triple Occupancy Room';
  let count = roomNameOrCount;

  if (typeof roomNameOrCount === 'string') {
    roomName = roomNameOrCount;
    count = maybeCount;
  }

  if (typeof count !== 'number') {
    count = parseInt(count, 10);
  }

  if (isNaN(count)) {
    console.error('Invalid count provided. Usage: setRoomAvailability(3) or setRoomAvailability("Triple Occupancy Room", 3)');
    return false;
  }

  await waitForFirebaseReady();
  if (!hasFirestore()) {
    console.error('Firestore not initialized');
    return false;
  }

  const roomRef = getRoomRef(roomName);
  if (!roomRef) {
    console.error('Room ref not found for:', roomName);
    return false;
  }

  await FirestoreHelpers.api.setDoc(roomRef, {
    name: roomName,
    available: count
  }, { merge: true });

  console.log(`✅ Updated "${roomName}" availability to ${count} rooms.`);
  return true;
};

async function decrementRoomAvailability(roomName) {
  if (!hasFirestore() || !roomName) return;

  try {
    const roomRef = getRoomRef(roomName);
    if (!roomRef) return;

    const roomSnap = await FirestoreHelpers.api.getDoc(roomRef);
    if (!roomSnap.exists()) return;

    const currentAvailable = roomSnap.data().available || 0;
    if (currentAvailable <= 0) return;

    await FirestoreHelpers.api.updateDoc(roomRef, {
      available: currentAvailable - 1
    });
  } catch (error) {
    console.error('Failed to decrement room availability:', error);
  }
}

function getRoomNameFromPage() {
  const el = document.getElementById('roomName');
  return el ? el.textContent.trim() : 'Selected Room';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderReservationRequests(docs) {
  const container = document.getElementById('reservationRequestsContainer');
  if (!container) return;

  if (!docs.length) {
    container.innerHTML = '<div class="bg-white border rounded-lg p-6 text-gray-600">No pending reservation requests at the moment.</div>';
    return;
  }

  container.innerHTML = docs.map(doc => {
    const data = doc.data();
    const requestDate = data.moveInDate || 'Not specified';
    const amount = data.amount ? `₱${Number(data.amount).toLocaleString()}` : 'TBD';
    const status = data.status || 'Pending';
    const statusClass = status === 'Approved'
      ? 'px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800'
      : status === 'Declined'
        ? 'px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800'
        : 'px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800';

    return `
      <div class="bg-white border rounded-lg p-6">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h4 class="text-lg font-bold">${escapeHtml(data.name || 'Guest')}</h4>
              <span class="${statusClass}">${escapeHtml(status)}</span>
            </div>
            <div class="text-sm text-gray-600 space-y-1">
              <div>Property: ${escapeHtml(data.room || 'Unknown')}</div>
              <div>Move-in Date: ${escapeHtml(requestDate)}</div>
              ${data.message ? `<div>Message: ${escapeHtml(data.message)}</div>` : ''}
              <div class="text-green-600 font-medium">Amount: ${escapeHtml(amount)}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${status === 'Approved' ? `
              <button onclick="window.openCreateTenantModalFromData && window.openCreateTenantModalFromData('${escapeHtml(data.name || '')}', '${escapeHtml(data.email || '')}', '${escapeHtml(data.phone || '')}', '', '${escapeHtml(data.room || '')}', '${escapeHtml(requestDate)}', '${data.amount || 5000}')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                Create Tenant Account
              </button>
            ` : `
              <button onclick="approveReservation('${doc.id}')" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 00-1.414 0L9 11.586 6.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l7-7a1 1 0 000-1.414z"/></svg>
                Approve
              </button>
              <button onclick="declineReservation('${doc.id}')" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10 7.293 11.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/></svg>
                Decline
              </button>
            `}
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderMessages(docs) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;

  if (!docs.length) {
    container.innerHTML = '<div class="bg-white border rounded-lg p-6 text-gray-600">No messages available.</div>';
    return;
  }

  container.innerHTML = docs.map(doc => {
    const data = doc.data();
    const isUnread = data.status === 'Unread';
    const statusBadge = isUnread
      ? '<span class="bg-blue-600 text-white px-2 py-1 rounded text-xs">New</span>'
      : `<span class="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">${escapeHtml(data.status || 'Read')}</span>`;

    return `
      <div class="bg-white border rounded-lg p-6 ${isUnread ? 'shadow-lg' : ''}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-gray-700 font-semibold">${escapeHtml((data.name || 'T').slice(0, 2).toUpperCase())}</div>
            <div>
              <div class="flex items-center gap-2 mb-1">
                <h4 class="text-lg font-bold">${escapeHtml(data.name || 'Tenant')}</h4>
                ${statusBadge}
              </div>
              <p class="text-gray-700 mb-1">${escapeHtml(data.message || 'No message content')}</p>
              <p class="text-sm text-gray-500">${escapeHtml(data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleString() : 'Just now')}</p>
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <button onclick="replyToMessage('${doc.id}')" class="px-4 py-2 border rounded-lg hover:bg-gray-50">Reply</button>
            <button onclick="deleteMessage('${doc.id}')" class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-red-600">Delete</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function setupAdminDashboardRealtime() {
  if (!hasFirestore()) {
    if (window.firebaseReady) {
      updateFirestoreHelpers();
    } else {
      window.addEventListener('firebase-ready', () => {
        updateFirestoreHelpers();
        setupAdminDashboardRealtime();
      }, { once: true });
      return;
    }
  }

  const firestoreStatusEl = document.getElementById('firestoreStatus');
  if (firestoreStatusEl) {
    firestoreStatusEl.textContent = 'Connecting to Firestore...';
  }

  const pendingCountEl = document.getElementById('pendingRequestsCount');
  const unreadCountEl = document.getElementById('unreadMessagesCount');

  const reservationsRef = getReservationsRef();
  const messagesRef = getMessagesRef();
  if (!reservationsRef || !messagesRef) {
    console.error('Admin realtime setup failed: missing Firestore refs', { reservationsRef, messagesRef });
    return;
  }

  const pendingQuery = FirestoreHelpers.api.query(
    reservationsRef,
    FirestoreHelpers.api.where('status', '==', 'Pending')
  );

  const messagesQuery = FirestoreHelpers.api.query(
    messagesRef,
    FirestoreHelpers.api.orderBy('createdAt', 'desc')
  );

  console.log('Admin realtime listening for pending reservations');
  FirestoreHelpers.api.onSnapshot(pendingQuery, (snapshot) => {
    if (pendingCountEl) {
      pendingCountEl.textContent = snapshot.size;
    }
    renderReservationRequests(snapshot.docs);
    if (firestoreStatusEl) {
      firestoreStatusEl.textContent = `Firestore connected — ${snapshot.size} pending reservation(s).`;
      firestoreStatusEl.className = 'text-sm text-green-600 mb-4';
    }
    console.log('Pending reservations snapshot update', snapshot.size, snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })));
  }, (error) => {
    console.error('Pending reservations snapshot failed:', error);
    if (firestoreStatusEl) {
      firestoreStatusEl.textContent = 'Firestore snapshot failed. See console for error.';
      firestoreStatusEl.className = 'text-sm text-red-600 mb-4';
    }
  });

  FirestoreHelpers.api.onSnapshot(messagesQuery, (snapshot) => {
    const unreadCount = snapshot.docs.filter(doc => doc.data().status === 'Unread').length;
    if (unreadCountEl) {
      unreadCountEl.textContent = unreadCount;
    }
    renderMessages(snapshot.docs);
  }, (error) => {
    console.error('Messages snapshot failed:', error);
  });
}

// Tab management
function setupTabs() {
  const tabButtons = document.querySelectorAll('[data-tab-button]');
  const tabContents = document.querySelectorAll('[data-tab-content]');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab-button');
      
      // Update button states
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Update content visibility
      tabContents.forEach(content => {
        if (content.getAttribute('data-tab-content') === targetTab) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });
    });
  });
}

// Form handlers
async function handleInquirySubmit(event) {
  event.preventDefault();
  const form = event.target;
  
  // Basic validation
  const name = form.querySelector('[name="name"]').value.trim();
  const email = form.querySelector('[name="email"]').value.trim();
  const phone = form.querySelector('[name="phone"]').value.trim();
  const moveInDate = form.querySelector('[name="moveInDate"]').value;
  const message = form.querySelector('[name="message"]').value.trim();
  const room = getRoomNameFromPage();
  
  if (!name || !email || !phone) {
    Toast.error('Please fill in all required fields');
    return;
  }

  const inquiryData = {
    name,
    email,
    phone,
    room,
    moveInDate: moveInDate || null,
    message: message || null,
    status: 'New',
    createdAt: null
  };

  if (!hasFirestore()) {
    const ready = await waitForFirebaseReady(7000);
    if (!ready) {
      console.error('Firebase did not initialize before submit.');
      Toast.error('Unable to submit inquiry. Firebase is not ready. Please refresh the page and try again.');
      return;
    }
  }

  const messagesRef = getMessagesRef();
  if (!messagesRef) {
    console.error('Messages collection reference is not available.');
    Toast.error('Unable to submit inquiry. Please refresh the page and try again.');
    return;
  }

  inquiryData.createdAt = FirestoreHelpers.api.serverTimestamp();
  console.log('Submitting inquiry', inquiryData);

  try {
    await FirestoreHelpers.api.addDoc(messagesRef, inquiryData);
    Toast.success("Inquiry sent successfully! We'll contact you soon.");
  } catch (error) {
    console.error('Firestore inquiry submit failed:', error);
    Toast.error('Unable to submit inquiry. Please try again.');
    return;
  }
  
  form.reset();
  
  const inquiryForm = document.getElementById('inquiryForm');
  if (inquiryForm) {
    inquiryForm.classList.add('hidden');
  }
}

async function handleReservationSubmit(event) {
  event.preventDefault();
  const form = event.target;
  
  // Basic validation
  const name = form.querySelector('[name="name"]').value.trim();
  const email = form.querySelector('[name="email"]').value.trim();
  const phone = form.querySelector('[name="phone"]').value.trim();
  const moveInDate = form.querySelector('[name="moveInDate"]').value;
  const messageElement = form.querySelector('[name="message"]');
  const message = messageElement ? messageElement.value.trim() : '';
  const additionalInfo = form.querySelector('[name="additionalInfo"]').value.trim();
  const room = getRoomNameFromPage();
  
  if (!name || !email || !phone) {
    Toast.error('Please fill in all required fields');
    return;
  }

  const reservationData = {
    name,
    email,
    phone,
    room,
    moveInDate: moveInDate || null,
    message: message || null,
    additionalInfo: additionalInfo || null,
    status: 'Pending',
    createdAt: null
  };

  if (!hasFirestore()) {
    const ready = await waitForFirebaseReady(7000);
    if (!ready) {
      console.error('Firebase did not initialize before submit.');
      Toast.error('Unable to submit reservation. Firebase is not ready. Please refresh the page and try again.');
      return;
    }
  }

  const reservationsRef = getReservationsRef();
  if (!reservationsRef) {
    console.error('Reservations collection reference is not available.', {
      hasFirestore: hasFirestore(),
      firebaseDb: FirestoreHelpers.db,
      firebaseApi: FirestoreHelpers.api
    });
    Toast.error('Unable to submit reservation. Please refresh the page and try again.');
    return;
  }

  reservationData.createdAt = FirestoreHelpers.api.serverTimestamp();
  console.log('Submitting reservation', reservationData);

  try {
    await FirestoreHelpers.api.addDoc(reservationsRef, reservationData);
    Toast.success('Reservation request submitted! The admin will review your request and contact you.');
  } catch (error) {
    console.error('Firestore reservation submit failed:', error);
    Toast.error('Unable to submit reservation. Please try again.');
    return;
  }
  
  form.reset();
  
  const reservationForm = document.getElementById('reservationForm');
  if (reservationForm) {
    reservationForm.classList.add('hidden');
  }
}

function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.target;
  
  const email = form.querySelector('[name="email"]').value;
  const password = form.querySelector('[name="password"]').value;
  const role = 'admin';
  
  if (!email || !password) {
    Toast.error('Please enter your credentials');
    return;
  }
  
  // Simulate login - redirect as admin only
  Toast.success('Login successful! Redirecting...');
  
  setTimeout(() => {
    window.location.href = './admin-dashboard.html';
  }, 1000);
}

// Toggle form visibility
function toggleInquiryForm() {
  const form = document.getElementById('inquiryForm');
  if (form) {
    form.classList.toggle('hidden');
  }
  
  // Hide reservation form if open
  const reservationForm = document.getElementById('reservationForm');
  if (reservationForm && !reservationForm.classList.contains('hidden')) {
    reservationForm.classList.add('hidden');
  }
}

function toggleReservationForm() {
  const form = document.getElementById('reservationForm');
  if (form) {
    form.classList.toggle('hidden');
  }
  
  // Hide inquiry form if open
  const inquiryForm = document.getElementById('inquiryForm');
  if (inquiryForm && !inquiryForm.classList.contains('hidden')) {
    inquiryForm.classList.add('hidden');
  }
}

// Get URL parameters
function getUrlParameter(name) {
  name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
  const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
  const results = regex.exec(location.search);
  return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href !== '#' && href !== '') {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    }
  });
});

// Admin dashboard - approve/decline reservation
async function approveReservation(reservationId) {
  if (hasFirestore()) {
    try {
      const reservationDoc = FirestoreHelpers.api.doc(FirestoreHelpers.db, 'reservations', reservationId);
      const reservationSnap = await FirestoreHelpers.api.getDoc(reservationDoc);
      const reservationData = reservationSnap.exists() ? reservationSnap.data() : null;

      await FirestoreHelpers.api.updateDoc(reservationDoc, {
        status: 'Approved',
        decisionAt: FirestoreHelpers.api.serverTimestamp()
      });

      if (reservationData?.room) {
        await decrementRoomAvailability(reservationData.room);
      }

      Toast.success('Reservation approved! Notification sent to tenant.');
      return;
    } catch (error) {
      console.error('Firestore approve failed:', error);
      Toast.error('Unable to approve reservation.');
      return;
    }
  }

  Toast.success('Reservation approved! Notification sent to tenant.');
  setTimeout(() => {
    location.reload();
  }, 1500);
}

async function declineReservation(reservationId) {
  const reason = prompt('Enter reason for declining (optional):');
  if (hasFirestore()) {
    try {
      const reservationDoc = FirestoreHelpers.api.doc(FirestoreHelpers.db, 'reservations', reservationId);
      await FirestoreHelpers.api.updateDoc(reservationDoc, {
        status: 'Declined',
        declineReason: reason || null,
        decisionAt: FirestoreHelpers.api.serverTimestamp()
      });
      Toast.success('Reservation declined. Notification sent to tenant.');
      return;
    } catch (error) {
      console.error('Firestore decline failed:', error);
      Toast.error('Unable to decline reservation.');
      return;
    }
  }

  Toast.success('Reservation declined. Notification sent to tenant.');
  setTimeout(() => {
    location.reload();
  }, 1500);
}

async function replyToMessage(messageId) {
  const response = prompt('Enter your reply:');
  if (!response) return;

  if (hasFirestore()) {
    try {
      const messageDoc = FirestoreHelpers.api.doc(FirestoreHelpers.db, 'messages', messageId);
      await FirestoreHelpers.api.updateDoc(messageDoc, {
        reply: response,
        status: 'Read',
        repliedAt: FirestoreHelpers.api.serverTimestamp()
      });
      Toast.success('Reply saved and marked as read.');
      return;
    } catch (error) {
      console.error('Firestore reply failed:', error);
      Toast.error('Unable to send reply.');
      return;
    }
  }

  Toast.success('Reply sent successfully!');
}

async function deleteMessage(messageId) {
  if (hasFirestore()) {
    try {
      const messageDoc = FirestoreHelpers.api.doc(FirestoreHelpers.db, 'messages', messageId);
      await FirestoreHelpers.api.deleteDoc(messageDoc);
      Toast.success('Message deleted.');
      return;
    } catch (error) {
      console.error('Firestore delete failed:', error);
      Toast.error('Unable to delete message.');
      return;
    }
  }

  Toast.success('Message deleted.');
  setTimeout(() => {
    location.reload();
  }, 1500);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupAdminDashboardRealtime();
  updateIndexRoomAvailability();
  
  // Set up form handlers
  const inquiryForm = document.getElementById('inquiryFormElement');
  if (inquiryForm) {
    inquiryForm.addEventListener('submit', handleInquirySubmit);
  }
  
  const reservationForm = document.getElementById('reservationFormElement');
  if (reservationForm) {
    reservationForm.addEventListener('submit', handleReservationSubmit);
  }
  
  const loginForm = document.getElementById('loginForm');
  if (loginForm && !window.disableMainLoginHandler) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }
});

// Export functions for global use
window.Toast = Toast;
window.toggleInquiryForm = toggleInquiryForm;
window.toggleReservationForm = toggleReservationForm;
window.approveReservation = approveReservation;
window.declineReservation = declineReservation;
window.replyToMessage = replyToMessage;
window.deleteMessage = deleteMessage;
window.getUrlParameter = getUrlParameter;