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
            ? `<span class="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap">${escapeHtml(t.room)}</span>`
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
    <div class="bg-white border rounded-xl shadow-sm overflow-hidden flex flex-col md:grid md:grid-cols-3 h-auto md:h-[600px]">
      <div class="border-b md:border-b-0 md:border-r flex flex-col max-h-[190px] md:max-h-none md:h-full overflow-hidden shrink-0">
        <div class="px-3.5 py-3 md:p-4 border-b bg-gray-50/70 flex items-center justify-between">
          <span class="font-bold text-sm text-gray-800">Chats</span>
          <span class="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-semibold">${threads.length}</span>
        </div>
        <div class="flex-1 overflow-y-auto divide-y divide-gray-100">
          ${sidebarItems}
        </div>
      </div>

      <div class="md:col-span-2 flex flex-col h-[440px] md:h-full bg-gray-50/50 overflow-hidden">
        <div class="px-3.5 py-3 md:p-4 bg-white border-b flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr ${avatarGradient(
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
      ? `<span class="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap shrink-0">${escapeHtml(
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

        <div id="adminChatHistory" class="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3">
          ${bubblesHtml}
        </div>

        <form id="adminChatForm" data-email="${attr(
      activeThread.email
    )}" data-name="${attr(activeThread.name)}" class="p-2.5 sm:p-3 bg-white border-t flex items-center gap-2">
          <input
            type="text"
            name="message"
            id="adminChatInput"
            required
            autocomplete="off"
            placeholder="Message ${attr(activeThread.name)}..."
            class="flex-1 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-gray-100 border border-transparent focus:bg-white focus:border-blue-500 rounded-full text-xs sm:text-sm outline-none transition-all"
          />
          <button
            type="submit"
            class="px-4 sm:px-5 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full text-xs sm:text-sm font-semibold transition-colors shadow-sm shrink-0"
          >
            Send
          </button>
        </form>
      </div>
    </div>`;

  const historyEl = document.getElementById('adminChatHistory');
  if (historyEl) {
    historyEl.scrollTop = historyEl.scrollHeight;
    requestAnimationFrame(() => {
      historyEl.scrollTop = historyEl.scrollHeight;
    });
  }
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

  let latestThreadMs = 0;
  const emailLower = cleanEmail.toLowerCase();
  for (const doc of latestMessageDocs) {
    const d = doc.data();
    if ((d.email || '').trim().toLowerCase() !== emailLower) continue;
    const raw = d._serverCreatedAt || d.createdAt;
    const ms = raw?.seconds ? raw.seconds * 1000 : new Date(raw || 0).getTime();
    if (Number.isFinite(ms) && ms > latestThreadMs) latestThreadMs = ms;
  }
  const safeCreatedAt = new Date(Math.max(Date.now(), latestThreadMs + 1000)).toISOString();

  try {
    const messagesRef = supabaseData.collection(db, 'messages');
    await supabaseData.addDoc(messagesRef, {
      name: name || cleanEmail.split('@')[0] || 'Tenant',
      email: cleanEmail,
      message: cleanText,
      status: 'Read',
      sender: 'admin',
      createdAt: safeCreatedAt,
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
export function isSupportDoc(doc) {
  const d = typeof doc?.data === 'function' ? doc.data() : doc || {};
  return (
    d.room === 'Customer Support' ||
    d.source === 'customer-support' ||
    Boolean(d.subject && !d.property) ||
    (typeof d.message === 'string' && d.message.startsWith('['))
  );
}

export function renderMessages(docs) {
  const container = document.getElementById('messagesContainer');
  const tenantContainer = document.getElementById('tenantMessagesContainer');
  const supportContainer = document.getElementById('customerSupportContainer');
  if (!container && !tenantContainer && !supportContainer) return;

  const docList = Array.isArray(docs) ? docs : docs?.docs || [];
  latestMessageDocs = docList;

  const renderCard = (doc, isTenant, isSupport = false) => {
    const data = doc.data();
    const unread = data.status === 'Unread' || data.status === 'New';
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

    let subject = data.subject || '';
    let displayMessage = data.message || 'No message content';
    if (!subject && typeof data.message === 'string') {
      const match = data.message.match(/^\[(.*?)\]\s*([\s\S]*)$/);
      if (match) {
        subject = match[1];
        displayMessage = match[2];
      }
    }
    if (!subject && data.room === 'Customer Support') {
      subject = 'General Inquiry';
    }

    const replyHtml = data.reply
      ? `<div class="mt-3 p-3 bg-gray-50 border-l-4 border-emerald-500 rounded text-sm">
           <span class="font-semibold text-gray-700">Admin reply:</span>
           <p class="text-gray-600 mt-0.5">${escapeHtml(data.reply)}</p>
         </div>`
      : '';

    const subjectBadge = subject
      ? `<span class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-xs font-semibold">Topic: ${escapeHtml(subject)}</span>`
      : '';

    const unitLabel =
      !isSupport && (data.room || data.property) && data.room !== 'Customer Support'
        ? data.room || data.property
        : data.property || '';
    const moveInLabel = data.moveInDate
      ? (() => {
        const dt = new Date(data.moveInDate);
        return Number.isNaN(dt.getTime())
          ? String(data.moveInDate)
          : dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
      })()
      : '';

    const metaHtml =
      !isTenant && (unitLabel || moveInLabel || data.email || data.phone || subject)
        ? `<div class="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1.5">
           ${subjectBadge}
           ${unitLabel ? `<span class="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-medium">Unit: ${escapeHtml(unitLabel)}</span>` : ''}
           ${moveInLabel ? `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-semibold">Preferred Move-in: ${escapeHtml(moveInLabel)}</span>` : ''}
           ${data.email ? `<span class="bg-gray-100 px-2 py-0.5 rounded">${escapeHtml(data.email)}</span>` : ''}
           ${data.phone ? `<span class="bg-gray-100 px-2 py-0.5 rounded">${escapeHtml(data.phone)}</span>` : ''}
         </div>`
        : data.email
          ? `<div class="text-xs text-gray-500 mt-1">${escapeHtml(data.email)}</div>`
          : '';

    const targetSubject = isSupport
      ? (subject || 'Customer Support Inquiry')
      : (subject || (data.room ? `Inquiry regarding ${data.room}` : 'Property Inquiry'));

    const actionButtons = `
        <button
          type="button"
          data-action="gcompose"
          data-id="${attr(doc.id)}"
          data-email="${attr(data.email || '')}"
          data-name="${attr(data.name || '')}"
          ${!isSupport ? `data-room="${attr(data.room || data.property || '')}"` : ''}
          data-subject="${attr(targetSubject)}"
          data-message="${attr(displayMessage)}"
          title="Opens Gmail specifically for homespotapartment@gmail.com (never uses personal browser accounts)"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm cursor-pointer"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
          </svg>
          Reply via Gmail
        </button>
        <button data-action="delete-message" data-id="${attr(doc.id)}" class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-red-600 text-sm font-medium">Delete</button>
      `;

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
                <p class="text-gray-700 mb-1">${escapeHtml(displayMessage)}</p>
                ${metaHtml}
                ${replyHtml}
                <p class="text-sm text-gray-500 mt-2">${createdAt}</p>
              </div>
            </div>
            <div class="flex flex-col gap-2">
              ${actionButtons}
            </div>
          </div>
        </div>`;
  };

  const supportDocs = docList.filter(
    (doc) => isSupportDoc(doc) && doc.data().sender !== 'tenant' && doc.data().sender !== 'admin'
  );

  const inquiryDocs = docList.filter(
    (doc) => !isSupportDoc(doc) && doc.data().sender !== 'tenant' && doc.data().sender !== 'admin'
  );

  if (tenantContainer) {
    renderTenantMessenger(tenantContainer, docList);
  }

  if (supportContainer) {
    supportContainer.innerHTML = supportDocs.length
      ? supportDocs.map((doc) => renderCard(doc, false, true)).join('')
      : '<div class="bg-white border rounded-lg p-6 text-gray-600 text-center">No customer support messages received yet.</div>';
  }

  if (container) {
    container.innerHTML = inquiryDocs.length
      ? inquiryDocs.map((doc) => renderCard(doc, false, false)).join('')
      : '<div class="bg-white border rounded-lg p-6 text-gray-600 text-center">No public inquiries available.</div>';
  }
}

/**
 * Prompts for a reply and saves it, marking the message read.
 * @param {string} messageId
 */

/**
 * Opens Gmail compose in a new tab with recipient, subject, and quoted inquiry message.
 * Also marks the message read in Supabase.
 * @param {{ email: string, name?: string, subject?: string, message?: string, id?: string }} params
 */
export function formatRecipientName(rawName) {
  if (!rawName) return 'there';
  const clean = rawName.includes(',') ? rawName.split(',')[1].trim() : rawName.trim();
  return clean
    .toLowerCase()
    .replace(/(?:^|[\s-])\S/g, (char) => char.toUpperCase());
}

/**
 * Opens Gmail compose in a new tab with recipient, subject, and quoted inquiry message.
 * Also marks the message read in Supabase.
 * @param {{ email: string, name?: string, subject?: string, message?: string, id?: string, room?: string }} params
 */
const OFFICIAL_SUPPORT_GMAIL = 'homespotapartment@gmail.com';

export function openGCompose({ email, name, subject, message, id, room }) {
  if (!email) {
    Toast.error('No email address available for this message.');
    return;
  }
  const formattedName = formatRecipientName(name);
  const cleanSubject = subject || (room ? `Inquiry regarding ${room}` : 'Public Inquiry');
  const su = encodeURIComponent(`Re: [HomeSpot] ${cleanSubject}`);
  const bodyText = `Hi ${formattedName},\n\n` +
    'Thank you for reaching out to MJP Residences.\n\n' +
    'Regarding your inquiry:\n' +
    `"${message || ''}"\n\n\n\n` +
    'Best regards,\nHome-Spot Support Team\nMJP Residences';
  const body = encodeURIComponent(bodyText);
  const composeTarget = `https://mail.google.com/mail/?authuser=${encodeURIComponent(OFFICIAL_SUPPORT_GMAIL)}&view=cm&fs=1&to=${encodeURIComponent(email)}&su=${su}&body=${body}`;
  const gmailUrl = `https://accounts.google.com/AccountChooser?Email=${encodeURIComponent(OFFICIAL_SUPPORT_GMAIL)}&continue=${encodeURIComponent(composeTarget)}`;

  window.open(gmailUrl, '_blank', 'noopener,noreferrer');

  if (id && isDataReady()) {
    const ref = supabaseData.doc(db, 'messages', id);
    supabaseData.updateDoc(ref, {
      status: 'Read',
      updatedAt: supabaseData.serverTimestamp()
    }).catch((err) => console.warn('Could not mark message as read on gcompose:', err));
  }
}

export async function replyToMessage(messageId) {
  const response = await Toast.prompt({
    title: 'Reply to Inquiry',
    message: 'Enter your reply to this inquiry below:',
    placeholder: 'Type your reply here...',
    confirmText: 'Send Reply',
    cancelText: 'Cancel'
  });
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
          (doc.data().status === 'Unread' || doc.data().status === 'New') &&
          !isSupportDoc(doc) &&
          doc.data().sender !== 'tenant' &&
          doc.data().sender !== 'admin'
      ).length;

      const tenantBadge = document.getElementById('unreadTenantMessagesCount');
      if (tenantBadge) {
        tenantBadge.textContent = tenantUnread;
        tenantBadge.classList.toggle('hidden', tenantUnread === 0);
      }
      const tenantStat = document.getElementById('unreadTenantMessagesStatCount');
      if (tenantStat) {
        tenantStat.textContent = tenantUnread;
      }

      const inquiryBadge = document.getElementById('unreadInquiriesCount');
      if (inquiryBadge) {
        inquiryBadge.textContent = inquiryUnread;
        inquiryBadge.classList.toggle('hidden', inquiryUnread === 0);
      }
      const inquiryStat = document.getElementById('unreadInquiriesStatCount');
      if (inquiryStat) {
        inquiryStat.textContent = inquiryUnread;
      }

      const supportUnread = allDocs.filter(
        (doc) =>
          (doc.data().status === 'Unread' || doc.data().status === 'New') &&
          isSupportDoc(doc) &&
          doc.data().sender !== 'tenant' &&
          doc.data().sender !== 'admin'
      ).length;
      const supportBadge = document.getElementById('unreadSupportCount');
      if (supportBadge) {
        supportBadge.textContent = supportUnread;
        supportBadge.classList.toggle('hidden', supportUnread === 0);
      }

      onUnreadCount?.({
        total: tenantUnread + inquiryUnread + supportUnread,
        tenantUnread,
        inquiryUnread,
        supportUnread
      });
      renderMessages(allDocs);
    },
    (error) => {
      console.error('Messages subscription failed:', error);
    }
  );
}
