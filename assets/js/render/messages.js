/**
 * Tenant <-> staff message rendering (admin dashboard).
 */

import { db, supabaseData, getMessagesRef, isDataReady } from '../supabase-service.js';
import { escapeHtml } from '../lib/format.js';
import { attr } from '../lib/dom.js';
import { Toast } from './toast.js';

/**
 * Renders messages into #messagesContainer.
 * @param {{ empty: boolean, map: (callback: (doc: {id: string, data: () => Object}) => string) => string[] }} docs
 */
export function renderMessages(docs) {
  const container = document.getElementById('messagesContainer');
  const tenantContainer = document.getElementById('tenantMessagesContainer');
  if (!container && !tenantContainer) return;

  const docList = Array.isArray(docs) ? docs : docs?.docs || [];

  const renderCard = (doc, isTenant) => {
    const data = doc.data();
    const unread = data.status === 'Unread';
    const badge = unread
      ? '<span class="bg-blue-600 text-white px-2 py-1 rounded text-xs font-semibold">New</span>'
      : `<span class="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">${escapeHtml(data.status || 'Read')}</span>`;

    const createdAt = data.createdAt
      ? escapeHtml(
          new Date(
            data.createdAt.seconds ? data.createdAt.seconds * 1000 : data.createdAt
          ).toLocaleString()
        )
      : 'Just now';

    const avatarInitial = escapeHtml(
      (data.name || (isTenant ? 'T' : 'G')).slice(0, 2).toUpperCase()
    );

    const replyHtml = data.reply
      ? `<div class="mt-3 p-3 bg-gray-50 border-l-4 border-emerald-500 rounded text-sm">
           <span class="font-semibold text-gray-700">Admin reply:</span>
           <p class="text-gray-600 mt-0.5">${escapeHtml(data.reply)}</p>
         </div>`
      : '';

    const metaHtml =
      !isTenant && (data.property || data.email || data.phone)
        ? `<div class="flex flex-wrap gap-2 text-xs text-gray-500 mt-1">
           ${data.property ? `<span class="bg-gray-100 px-2 py-0.5 rounded">Property: ${escapeHtml(data.property)}</span>` : ''}
           ${data.email ? `<span class="bg-gray-100 px-2 py-0.5 rounded">${escapeHtml(data.email)}</span>` : ''}
           ${data.phone ? `<span class="bg-gray-100 px-2 py-0.5 rounded">${escapeHtml(data.phone)}</span>` : ''}
         </div>`
        : data.email
          ? `<div class="text-xs text-gray-500 mt-1">${escapeHtml(data.email)}</div>`
          : '';

    return `
        <div class="bg-white border rounded-lg p-6 ${unread ? 'shadow-lg border-blue-200' : ''}">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 ${isTenant ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'} rounded-full flex items-center justify-center font-semibold text-sm">${avatarInitial}</div>
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <h4 class="text-lg font-bold">${escapeHtml(data.name || (isTenant ? 'Tenant' : 'Guest'))}</h4>
                  ${badge}
                </div>
                <p class="text-gray-700 mb-1">${escapeHtml(data.message || 'No message content')}</p>
                ${metaHtml}
                ${replyHtml}
                <p class="text-sm text-gray-500 mt-2">${createdAt}</p>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <button data-action="reply" data-id="${attr(doc.id)}" class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm font-medium">Reply</button>
              <button data-action="delete-message" data-id="${attr(doc.id)}" class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-red-600 text-sm font-medium">Delete</button>
            </div>
          </div>
        </div>`;
  };

  const tenantDocs = docList.filter((doc) => doc.data().sender === 'tenant');
  const inquiryDocs = docList.filter((doc) => doc.data().sender !== 'tenant');

  if (tenantContainer) {
    tenantContainer.innerHTML = tenantDocs.length
      ? tenantDocs.map((doc) => renderCard(doc, true)).join('')
      : '<div class="bg-white border rounded-lg p-6 text-gray-600 text-center">No tenant messages available.</div>';
  }

  if (container) {
    const targetDocs = tenantContainer ? inquiryDocs : docList;
    container.innerHTML = targetDocs.length
      ? targetDocs.map((doc) => renderCard(doc, !tenantContainer && doc.data().sender === 'tenant')).join('')
      : '<div class="bg-white border rounded-lg p-6 text-gray-600 text-center">No public inquiries available.</div>';
  }
}

/**
 * Prompts for a reply and saves it, marking the message read.
 * @param {string} messageId
 */
export async function replyToMessage(messageId) {
  const response = prompt('Enter your reply:');
  if (!response) return;

  if (!isDataReady()) {
    Toast.error('Supabase is not available.');
    return;
  }

  try {
    const ref = supabaseData.doc(db, 'messages', messageId);
    await supabaseData.updateDoc(ref, {
      reply: response,
      status: 'Read',
      repliedAt: supabaseData.serverTimestamp()
    });
    Toast.success('Reply saved and marked as read.');
  } catch (error) {
    console.error('Supabase reply failed:', error);
    Toast.error('Unable to send reply.');
  }
}

/**
 * Deletes a message.
 * @param {string} messageId
 */
export async function deleteMessage(messageId) {
  if (!isDataReady()) {
    Toast.error('Supabase is not available.');
    return;
  }

  try {
    const ref = supabaseData.doc(db, 'messages', messageId);
    await supabaseData.deleteDoc(ref);
    Toast.success('Message deleted.');
  } catch (error) {
    console.error('Supabase delete failed:', error);
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

  const query = supabaseData.query(ref, supabaseData.orderBy('createdAt', 'desc'));

  return supabaseData.onSnapshot(
    query,
    (snapshot) => {
      const allDocs = snapshot.docs || [];
      const tenantUnread = allDocs.filter(
        (doc) => doc.data().status === 'Unread' && doc.data().sender === 'tenant'
      ).length;
      const inquiryUnread = allDocs.filter(
        (doc) => doc.data().status === 'Unread' && doc.data().sender !== 'tenant'
      ).length;

      const tenantBadge = document.getElementById('unreadTenantMessagesCount');
      if (tenantBadge) {
        tenantBadge.textContent = tenantUnread;
        tenantBadge.classList.toggle('hidden', tenantUnread === 0);
      }
      const inquiryBadge = document.getElementById('unreadInquiriesCount');
      if (inquiryBadge) {
        inquiryBadge.textContent = inquiryUnread;
        inquiryBadge.classList.toggle('hidden', inquiryUnread === 0);
      }

      onUnreadCount?.(tenantUnread + inquiryUnread);
      renderMessages(allDocs);
    },
    (error) => {
      console.error('Messages subscription failed:', error);
    }
  );
}
