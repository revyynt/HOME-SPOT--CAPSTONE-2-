/**
 * Tenant <-> staff message rendering (admin dashboard).
 */

import { db, firebaseFirestore, getMessagesRef, isFirestoreReady } from '../firebase-service.js';
import { escapeHtml } from '../lib/format.js';
import { attr } from '../lib/dom.js';
import { Toast } from './toast.js';

/**
 * Renders messages into #messagesContainer.
 * @param {import('firebase/firestore').QuerySnapshot} docs
 */
export function renderMessages(docs) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;

  if (docs.empty) {
    container.innerHTML =
      '<div class="bg-white border rounded-lg p-6 text-gray-600">No messages available.</div>';
    return;
  }

  container.innerHTML = docs
    .map((doc) => {
      const data = doc.data();
      const unread = data.status === 'Unread';
      const badge = unread
        ? '<span class="bg-blue-600 text-white px-2 py-1 rounded text-xs">New</span>'
        : `<span class="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">${escapeHtml(data.status || 'Read')}</span>`;

      // createdAt is a Firestore Timestamp; tolerate a plain value too.
      const createdAt = data.createdAt
        ? escapeHtml(new Date((data.createdAt.seconds ?? 0) * 1000).toLocaleString())
        : 'Just now';

      return `
        <div class="bg-white border rounded-lg p-6 ${unread ? 'shadow-lg' : ''}">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-gray-700 font-semibold">${escapeHtml((data.name || 'T').slice(0, 2).toUpperCase())}</div>
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <h4 class="text-lg font-bold">${escapeHtml(data.name || 'Tenant')}</h4>
                  ${badge}
                </div>
                <p class="text-gray-700 mb-1">${escapeHtml(data.message || 'No message content')}</p>
                <p class="text-sm text-gray-500">${createdAt}</p>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <button data-action="reply" data-id="${attr(doc.id)}" class="px-4 py-2 border rounded-lg hover:bg-gray-50">Reply</button>
              <button data-action="delete-message" data-id="${attr(doc.id)}" class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-red-600">Delete</button>
            </div>
          </div>
        </div>`;
    })
    .join('');
}

/**
 * Prompts for a reply and saves it, marking the message read.
 * @param {string} messageId
 */
export async function replyToMessage(messageId) {
  const response = prompt('Enter your reply:');
  if (!response) return;

  if (!isFirestoreReady()) {
    Toast.error('Firestore is not available.');
    return;
  }

  try {
    const ref = firebaseFirestore.doc(db, 'messages', messageId);
    await firebaseFirestore.updateDoc(ref, {
      reply: response,
      status: 'Read',
      repliedAt: firebaseFirestore.serverTimestamp()
    });
    Toast.success('Reply saved and marked as read.');
  } catch (error) {
    console.error('Firestore reply failed:', error);
    Toast.error('Unable to send reply.');
  }
}

/**
 * Deletes a message.
 * @param {string} messageId
 */
export async function deleteMessage(messageId) {
  if (!isFirestoreReady()) {
    Toast.error('Firestore is not available.');
    return;
  }

  try {
    const ref = firebaseFirestore.doc(db, 'messages', messageId);
    await firebaseFirestore.deleteDoc(ref);
    Toast.success('Message deleted.');
  } catch (error) {
    console.error('Firestore delete failed:', error);
    Toast.error('Unable to delete message.');
  }
}

/**
 * Subscribes to the messages collection, newest first.
 * @param {(unreadCount: number) => void} [onUnreadCount]
 */
export function watchMessages(onUnreadCount) {
  const ref = getMessagesRef();
  if (!ref) return null;

  const query = firebaseFirestore.query(ref, firebaseFirestore.orderBy('createdAt', 'desc'));

  return firebaseFirestore.onSnapshot(
    query,
    (snapshot) => {
      const unread = snapshot.docs.filter((doc) => doc.data().status === 'Unread').length;
      onUnreadCount?.(unread);
      renderMessages(snapshot);
    },
    (error) => {
      console.error('Messages snapshot failed:', error);
    }
  );
}
