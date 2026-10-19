/**
 * Tenant <-> staff message rendering (admin dashboard).
 */

import { db, supabaseData, getMessagesRef, isDataReady } from '../supabase-service.js';
import { avatarGradient, buildTenantThreads, escapeHtml, initials } from '../lib/format.js';
import { attr } from '../lib/dom.js';
import { Toast } from './toast.js';
import { getTenants } from '../pages/admin-dashboard/tenants.js';

let latestMessageDocs = [];
let activeChatEmail = null;

function formatChatTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function renderTenantMessenger(tenantContainer, docList) {
  const threads = buildTenantThreads(docList, getTenants());

  if (!threads.length) {
    tenantContainer.innerHTML =
      '<div class="bg-white border rounded-lg p-6 text-gray-600 text-center">No tenants or tenant messages available yet.</div>';
    return;
  }

  const activeThread =
    threads.find((t) => t.email.toLowerCase() === activeChatEmail) || threads[0];
  activeChatEmail = activeThread.email.toLowerCase();

  const sidebarItems = threads
    .map((t) => {
      const isSelected = t.email.toLowerCase() === activeChatEmail;
      const preview = t.lastMessage
        ? `${t.lastMessage.sender === 'admin' ? 'You: ' : ''}${t.lastMessage.text}`
        : 'No messages yet';
      const timeLabel = t.lastTime ? formatChatTime(t.lastTime) : '';

      return `
        <button
          type="button"
          data-action="select-chat"
          data-email="${attr(t.email)}"
          class="w-full text-left px-4 py-3.5 hover:bg-gray-50 transition-colors flex items-center gap-3 ${isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : ''
        }"
        >
          <div class="w-10 h-10 rounded-full bg-gradient-to-tr ${avatarGradient(
          t.name
        )} text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
            ${escapeHtml(initials(t.name))}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm ${t.unreadCount ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'
        } truncate">${escapeHtml(t.name)}</span>
              <span class="text-[11px] text-gray-400 flex-shrink-0">${escapeHtml(timeLabel)}</span>
            </div>
            <div class="flex items-center justify-between gap-2 mt-0.5">
              <p class="text-xs ${t.unreadCount ? 'font-semibold text-gray-900' : 'text-gray-500'
        } truncate">${escapeHtml(preview)}</p>
              ${t.unreadCount
          ? `<span class="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">${t.unreadCount}</span>`
          : t.room
            ? `<span class="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex-shrink-0">${escapeHtml(t.room)}</span>`
            : ''
        }
            </div>
          </div>
        </button>`;
    })
    .join('');

  const bubblesHtml = activeThread.items.length
    ? activeThread.items
      .map((item) => {
        const isAdmin = item.sender === 'admin';
        const timeStr = formatChatTime(item.timeMs) || 'Just now';
        return `
            <div class="flex ${isAdmin ? 'justify-end' : 'justify-start'} group">
              <div class="max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${isAdmin
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
          }">
                <p class="text-sm whitespace-pre-wrap break-words">${escapeHtml(item.text)}</p>
                <div class="flex items-center justify-end gap-2 mt-1 text-[11px] ${isAdmin ? 'text-blue-100' : 'text-gray-400'
          }">
                  <span>${escapeHtml(timeStr)}</span>
                  ${!item.legacyReply
            ? `<button type="button" data-action="delete-message" data-id="${attr(
              item.id
            )}" class="opacity-0 group-hover:opacity-100 hover:underline ${isAdmin ? 'text-white' : 'text-red-500'
            }" title="Delete message">Delete</button>`
            : ''
          }
                </div>
              </div>
            </div>`;
      })
      .join('')
    : `<div class="h-full flex items-center justify-center text-sm text-gray-400">
         No messages with ${escapeHtml(activeThread.name)} yet. Send a message below to start chatting.
       </div>`;

  tenantContainer.innerHTML = `
    <div class="bg-white border rounded-xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-3 h-[600px]">
      <div class="border-r flex flex-col h-full overflow-hidden">
        <div class="p-4 border-b bg-gray-50/70 flex items-center justify-between">
          <span class="font-bold text-sm text-gray-800">Chats</span>
          <span class="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-semibold">${threads.length}</span>
        </div>
        <div class="flex-1 overflow-y-auto divide-y divide-gray-100">
          ${sidebarItems}
        </div>
      </div>

      <div class="md:col-span-2 flex flex-col h-full bg-gray-50/50 overflow-hidden">
        <div class="p-4 bg-white border-b flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-full bg-gradient-to-tr ${avatarGradient(
    activeThread.name
  )} text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
              ${escapeHtml(initials(activeThread.name))}
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h4 class="font-bold text-gray-900 text-sm truncate">${escapeHtml(
    activeThread.name
  )}</h4>
                ${activeThread.room
      ? `<span class="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold px-2 py-0.5 rounded-md">${escapeHtml(
        activeThread.room
      )}</span>`
      : ''
    }
              </div>
              <p class="text-xs text-gray-500 font-mono truncate">${escapeHtml(
      activeThread.email
    )}</p>
            </div>
          </div>
        </div>

        <div id="adminChatHistory" class="flex-1 p-4 overflow-y-auto space-y-3">
          ${bubblesHtml}
        </div>

        <form id="adminChatForm" data-email="${attr(
      activeThread.email
    )}" data-name="${attr(activeThread.name)}" class="p-3 bg-white border-t flex items-center gap-2">
          <input
            type="text"
            name="message"
            id="adminChatInput"
            required
            autocomplete="off"
            placeholder="Message ${attr(activeThread.name)}..."
            class="flex-1 px-4 py-2.5 bg-gray-100 border border-transparent focus:bg-white focus:border-blue-500 rounded-full text-sm outline-none transition-all"
          />
          <button
            type="submit"
            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full text-sm font-semibold transition-colors shadow-sm"
          >
            Send
          </button>
        </form>
      </div>
    </div>`;

  const historyEl = document.getElementById('adminChatHistory');
  if (historyEl) historyEl.scrollTop = historyEl.scrollHeight;
}

export function refreshTenantMessenger() {
  const tenantContainer = document.getElementById('tenantMessagesContainer');
  if (tenantContainer) renderTenantMessenger(tenantContainer, latestMessageDocs);
}

export async function selectTenantChat(email) {
  if (!email) return;
  activeChatEmail = email.trim().toLowerCase();
  refreshTenantMessenger();
  document.getElementById('adminChatInput')?.focus();

  if (!isDataReady()) return;
  const unreadDocs = latestMessageDocs.filter((doc) => {
    const d = doc.data();
    return (
      d.sender === 'tenant' &&
      d.status === 'Unread' &&
      (d.email || '').trim().toLowerCase() === activeChatEmail
    );
  });

  for (const doc of unreadDocs) {
    try {
      await supabaseData.updateDoc(supabaseData.doc(db, 'messages', doc.id), { status: 'Read' });
    } catch (err) {
      console.warn('Failed to mark message read:', err);
    }
  }
}

export async function sendAdminChatMessage(email, name, messageText) {
  const cleanEmail = (email || '').trim();
  const cleanText = (messageText || '').trim();
  if (!cleanEmail || !cleanText) return;

  if (!isDataReady()) {
    Toast.error('Supabase is not available.');
    return;
  }

  try {
    const messagesRef = supabaseData.collection(db, 'messages');
    await supabaseData.addDoc(messagesRef, {
      name: name || cleanEmail.split('@')[0] || 'Tenant',
      email: cleanEmail,
      message: cleanText,
      status: 'Read',
      sender: 'admin',
      createdAt: supabaseData.serverTimestamp(),
      reply: null
    });
    await selectTenantChat(cleanEmail);
  } catch (error) {
    console.error('Supabase admin message send failed:', error);
    Toast.error('Unable to send message.');
  }
}

/**
 * Renders messages into #messagesContainer and #tenantMessagesContainer.
 * @param {{ empty: boolean, map: (callback: (doc: {id: string, data: () => Object}) => string) => string[] }} docs
 */
export function renderMessages(docs) {
  const container = document.getElementById('messagesContainer');
  const tenantContainer = document.getElementById('tenantMessagesContainer');
  if (!container && !tenantContainer) return;

  const docList = Array.isArray(docs) ? docs : docs?.docs || [];
  latestMessageDocs = docList;

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

  const inquiryDocs = docList.filter(
    (doc) => doc.data().sender !== 'tenant' && doc.data().sender !== 'admin'
  );

  if (tenantContainer) {
    renderTenantMessenger(tenantContainer, docList);
  }

  if (container) {
    const targetDocs = tenantContainer ? inquiryDocs : docList;
    container.innerHTML = targetDocs.length
      ? targetDocs
        .map((doc) => renderCard(doc, !tenantContainer && doc.data().sender === 'tenant'))
        .join('')
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
        (doc) =>
          doc.data().status === 'Unread' &&
          doc.data().sender !== 'tenant' &&
          doc.data().sender !== 'admin'
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
