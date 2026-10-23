/**
 * Admin dashboard calendar & schedule management.
 * Tracks move-in dates, payment due dates, maintenance, and viewings.
 */

import { escapeHtml } from '../../lib/format.js';
import { Toast } from '../../render/toast.js';

const STORAGE_KEY = 'homespot_calendar_events';

const DEFAULT_EVENTS = [
  {
    id: 'evt-1',
    date: '2026-05-01',
    title: 'Move-in: Anna Reyes',
    category: 'movein',
    room: 'Room 302',
    notes: 'Keycard and inventory checklist issued.'
  },
  {
    id: 'evt-2',
    date: '2026-05-03',
    title: 'Rent Due: Maria Santos',
    category: 'rent',
    room: 'Room 105',
    notes: 'Monthly rent ₱4,500 due via GCash.'
  },
  {
    id: 'evt-3',
    date: '2026-05-05',
    title: 'Rent Due: Juan Dela Cruz',
    category: 'rent',
    room: 'Room 201',
    notes: 'Monthly rent ₱5,000 due.'
  },
  {
    id: 'evt-4',
    date: '2026-05-08',
    title: 'Rent Due: Lisa Garcia',
    category: 'rent',
    room: 'Room 208',
    notes: 'Monthly rent ₱4,000 due.'
  },
  {
    id: 'evt-5',
    date: '2026-05-12',
    title: 'AC Maintenance & Filter Clean',
    category: 'maintenance',
    room: '2nd Floor Units',
    notes: 'Scheduled HVAC contractor visit.'
  },
  {
    id: 'evt-6',
    date: '2026-05-15',
    title: 'Unit Viewing: John Reyes',
    category: 'viewing',
    room: 'Single Occupancy Room',
    notes: 'Inquiry follow-up viewing scheduled at 2:00 PM.'
  },
  {
    id: 'evt-7',
    date: '2026-05-20',
    title: 'Move-in: Commercial Space',
    category: 'movein',
    room: 'Commercial Unit 1',
    notes: 'Business equipment move-in.'
  },
  {
    id: 'evt-8',
    date: '2026-05-25',
    title: 'Rent Due / Overdue Check',
    category: 'rent',
    room: 'Room 410',
    notes: 'Monthly statement review.'
  }
];

let currentYear = 2026;
let currentMonth = 4; // 0-indexed: 4 is May
let activeFilter = 'all';

export function getCalendarEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_EVENTS));
      return [...DEFAULT_EVENTS];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_EVENTS];
  } catch (error) {
    console.error('Failed to read calendar events:', error);
    return [...DEFAULT_EVENTS];
  }
}

export function saveCalendarEvents(events) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch (error) {
    console.error('Failed to save calendar events:', error);
  }
}

const CATEGORY_COLORS = {
  rent: {
    bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-500',
    label: 'Rent Due'
  },
  movein: {
    bg: 'bg-blue-50 text-blue-800 border-blue-200',
    dot: 'bg-blue-500',
    label: 'Move-In'
  },
  maintenance: {
    bg: 'bg-amber-50 text-amber-800 border-amber-200',
    dot: 'bg-amber-500',
    label: 'Maintenance'
  },
  viewing: {
    bg: 'bg-purple-50 text-purple-800 border-purple-200',
    dot: 'bg-purple-500',
    label: 'Viewing'
  }
};

export function renderCalendar() {
  const container = document.getElementById('calendarGridContainer');
  if (!container) return;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const titleEl = document.getElementById('calendarMonthTitle');
  if (titleEl) {
    titleEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  }

  const events = getCalendarEvents();

  // Update stat badges
  const statTotal = document.getElementById('calendarStatTotal');
  if (statTotal) statTotal.textContent = events.length;

  const statRent = document.getElementById('calendarStatRent');
  if (statRent) statRent.textContent = events.filter((e) => e.category === 'rent').length;

  const statMoveIns = document.getElementById('calendarStatMoveIns');
  if (statMoveIns) statMoveIns.textContent = events.filter((e) => e.category === 'movein').length;

  const statMaintenance = document.getElementById('calendarStatMaintenance');
  if (statMaintenance) statMaintenance.textContent = events.filter((e) => e.category === 'maintenance').length;

  // Compute month layout
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let html = `
    <div class="min-w-[700px]">
      <div class="grid grid-cols-7 gap-px bg-gray-200 rounded-t-lg overflow-hidden border">
        ${dayHeaders
          .map(
            (day) =>
              `<div class="bg-gray-50 py-2.5 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">${day}</div>`
          )
          .join('')}
      </div>
      <div class="grid grid-cols-7 gap-px bg-gray-200 border-x border-b rounded-b-lg overflow-hidden">
  `;

  // Previous month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const prevDay = daysInPrevMonth - i;
    html += `
      <div class="bg-gray-50/70 p-2 min-h-[105px] text-gray-400 select-none">
        <span class="text-xs font-medium text-gray-400">${prevDay}</span>
      </div>`;
  }

  // Days in current month
  for (let day = 1; day <= daysInMonth; day++) {
    const formattedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = events.filter((e) => {
      if (e.date !== formattedDate) return false;
      if (activeFilter !== 'all' && e.category !== activeFilter) return false;
      return true;
    });

    const isToday =
      new Date().getFullYear() === currentYear &&
      new Date().getMonth() === currentMonth &&
      new Date().getDate() === day;

    html += `
      <div class="bg-white p-2 min-h-[105px] border-t border-gray-100 flex flex-col justify-between hover:bg-blue-50/20 transition-colors">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-bold ${isToday ? 'w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center -ml-1 -mt-1' : 'text-gray-700'}">${day}</span>
          ${dayEvents.length > 0 ? `<span class="text-[10px] text-gray-400 font-semibold">${dayEvents.length}</span>` : ''}
        </div>
        <div class="space-y-1 overflow-hidden flex-1">
          ${dayEvents
            .map((evt) => {
              const meta = CATEGORY_COLORS[evt.category] || CATEGORY_COLORS.rent;
              return `
              <div
                class="text-[11px] p-1 rounded border ${meta.bg} font-medium truncate cursor-pointer hover:shadow-sm transition-all"
                title="${escapeHtml(evt.title)} - ${escapeHtml(evt.room || '')} (${escapeHtml(evt.notes || '')})"
                data-action="view-event"
                data-id="${escapeHtml(evt.id)}"
              >
                <span class="w-1.5 h-1.5 rounded-full ${meta.dot} inline-block mr-1"></span>
                <span>${escapeHtml(evt.title)}</span>
              </div>`;
            })
            .join('')}
        </div>
      </div>`;
  }

  // Trailing next-month days to complete 7-col grid
  const totalCells = firstDayIndex + daysInMonth;
  const remainingCells = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= remainingCells; d++) {
    html += `
      <div class="bg-gray-50/70 p-2 min-h-[105px] text-gray-400 select-none">
        <span class="text-xs font-medium text-gray-400">${d}</span>
      </div>`;
  }

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;
}

export function openAddEventModal() {
  const modal = document.getElementById('calendarEventModal');
  const form = document.getElementById('calendarEventForm');
  if (!modal || !form) return;

  form.reset();
  const dateInput = document.getElementById('eventDateInput');
  if (dateInput) {
    const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-05`;
    dateInput.value = todayStr;
  }

  modal.classList.remove('hidden');
}

export function closeCalendarModal() {
  document.getElementById('calendarEventModal')?.classList.add('hidden');
}

export function handleCalendarFormSubmit(event) {
  event.preventDefault();

  const title = document.getElementById('eventTitleInput')?.value.trim();
  const category = document.getElementById('eventCategoryInput')?.value || 'rent';
  const date = document.getElementById('eventDateInput')?.value;
  const room = document.getElementById('eventRoomInput')?.value.trim() || 'General';
  const notes = document.getElementById('eventNotesInput')?.value.trim();

  if (!title || !date) {
    Toast.error('Please specify an event title and date');
    return;
  }

  const events = getCalendarEvents();
  const newEvent = {
    id: `evt-${Date.now()}`,
    title,
    category,
    date,
    room,
    notes
  };

  events.push(newEvent);
  saveCalendarEvents(events);
  Toast.success(`Calendar event "${title}" added!`);

  closeCalendarModal();
  renderCalendar();
}

export function initCalendar() {
  renderCalendar();

  const form = document.getElementById('calendarEventForm');
  if (form) {
    form.addEventListener('submit', handleCalendarFormSubmit);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('[data-action="open-add-event"]')) {
      openAddEventModal();
      return;
    }

    if (target.closest('[data-action="close-calendar-modal"]')) {
      closeCalendarModal();
      return;
    }

    if (target.closest('[data-action="prev-month"]')) {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      renderCalendar();
      return;
    }

    if (target.closest('[data-action="next-month"]')) {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderCalendar();
      return;
    }

    if (target.closest('[data-action="today-month"]')) {
      currentYear = 2026;
      currentMonth = 4;
      renderCalendar();
      return;
    }

    // Category filter pills
    const filterBtn = target.closest('[data-calendar-filter]');
    if (filterBtn) {
      activeFilter = filterBtn.dataset.calendarFilter;
      document.querySelectorAll('[data-calendar-filter]').forEach((btn) => {
        const isActive = btn.dataset.calendarFilter === activeFilter;
        btn.className = isActive
          ? 'calendar-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white'
          : 'calendar-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200';
      });
      renderCalendar();
      return;
    }

    // View single event detail toast / popup
    const viewEvt = target.closest('[data-action="view-event"]');
    if (viewEvt) {
      const id = viewEvt.dataset.id;
      const evt = getCalendarEvents().find((e) => e.id === id);
      if (evt) {
        alert(
          `Event: ${evt.title}\nDate: ${evt.date}\nRoom: ${evt.room || 'General'}\nCategory: ${evt.category}\nNotes: ${evt.notes || 'None'}`
        );
      }
    }
  });
}
