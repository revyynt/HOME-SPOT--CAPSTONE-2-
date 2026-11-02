import { supabase, supabaseData } from '../supabase-service.js';
import {
  CURFEW_HOUR_START,
  CURFEW_HOUR_END,
  ABANDONMENT_THRESHOLD_DAYS,
  isCurfewViolation,
  computeDaysAway,
  formatGateTimestamp
} from './gate-logic.js';

export {
  CURFEW_HOUR_START,
  CURFEW_HOUR_END,
  ABANDONMENT_THRESHOLD_DAYS,
  isCurfewViolation,
  computeDaysAway,
  formatGateTimestamp
};

const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL || 'https://jfeosjevabaadudestcf.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || '';

/**
 * Play an authentic audio chime using the native Web Audio API (zero external assets).
 * High pitch double-chime for Entry, distinct lower chord for Exit.
 */
export function playGateChime(direction = 'IN') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (direction === 'IN') {
      // Pleasant welcoming double-beep: 880Hz -> 1174Hz (A5 -> D6)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime);
      gain1.gain.setValueAtTime(0.2, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.15);

      setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1174.66, ctx.currentTime);
        gain2.gain.setValueAtTime(0.25, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.25);
      }, 120);
    } else {
      // Exit chime: 659Hz -> 523Hz (E5 -> C5)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(523.25, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (err) {
    console.warn('Audio feedback silenced:', err);
  }
}

/**
 * Record a gate access tap (Entry / Exit) for a tenant.
 * Calls the gate-tap Edge Function so unauthenticated terminals (iPhone / kiosk)
 * can safely record taps without requiring an admin login session.
 */
export async function recordGateTap({ cardUid, tenantId, direction, source = 'NFC_KIOSK' }) {
  const cleanUid = String(cardUid || '').trim().toUpperCase();
  const cleanId = String(tenantId || '').trim();

  if (!cleanUid && !cleanId) {
    throw new Error('A Card UID or Tenant ID is required to log gate access.');
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gate-tap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY
      },
      body: JSON.stringify({ cardUid: cleanUid, tenantId: cleanId, direction, source })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || 'Gate tap failed.');
    }

    playGateChime(data.direction);
    return data;
  } catch (err) {
    console.warn('Edge function gate-tap error, trying direct fallback:', err);
  }

  // Direct fallback if edge function unavailable
    const tenantsRef = supabaseData.collection(supabase, 'tenants');
    const snap = await supabaseData.getDocs(tenantsRef);
    const tenantDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const tenant = tenantDocs.find((t) => {
      if (t.status === 'Archived') return false;
      if (cleanId && t.id === cleanId) return true;
      if (cleanUid) {
        const existingUid = String(t.cardUid || t.nfcCardId || '').trim().toUpperCase();
        if (existingUid === cleanUid) return true;
        const roomDigits = String(t.room || '').replace(/\D+/g, '');
        if (cleanUid === `NFC-${roomDigits}` || cleanUid === roomDigits) return true;
      }
      return false;
    });

    if (!tenant) {
      throw new Error(
        `Unrecognized or inactive keycard: "${cleanUid || cleanId}". Please register this card to an active tenant in Admin Dashboard.`
      );
    }

    const currentStatus = tenant.gateStatus || 'INSIDE';
    const resolvedDirection = direction ? direction.toUpperCase() : currentStatus === 'INSIDE' ? 'OUT' : 'IN';
    const now = new Date();
    const nowIso = now.toISOString();
    const isLate = resolvedDirection === 'IN' && isCurfewViolation(now);
    const finalCardUid = cleanUid || tenant.cardUid || `NFC-${String(tenant.room || '101').replace(/\D+/g, '')}`;

    const gateLogId = `gate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await supabaseData.setDoc(supabaseData.doc(supabase, 'messages', gateLogId), {
      type: 'gate_log',
      tenantId: tenant.id,
      tenantName: tenant.name || 'Tenant',
      email: tenant.email || '',
      room: tenant.room || '',
      cardUid: finalCardUid,
      direction: resolvedDirection,
      timestamp: nowIso,
      isLate,
      source,
      createdAt: nowIso
    });

    const tenantDocRef = supabaseData.doc(supabase, 'tenants', tenant.id);
    const updatedTenantData = {
      ...tenant,
      cardUid: finalCardUid,
      gateStatus: resolvedDirection === 'IN' ? 'INSIDE' : 'OUTSIDE',
      lastGateTapAt: nowIso,
      lastGateTapType: resolvedDirection,
      updatedAt: nowIso
    };
    await supabaseData.setDoc(tenantDocRef, updatedTenantData);

    playGateChime(resolvedDirection);

    return {
      success: true,
      tenant: updatedTenantData,
      direction: resolvedDirection,
      timestamp: nowIso,
      isLate,
      cardUid: finalCardUid
    };
}

/**
 * Fetch all gate activity logs, sorted newest first.
 */
export async function fetchGateLogs(limit = 100) {
  const messagesRef = supabaseData.collection(supabase, 'messages');
  const snap = await supabaseData.getDocs(messagesRef);
  const logs = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.type === 'gate_log')
    .sort((a, b) => new Date(b.timestamp || b.createdAt).getTime() - new Date(a.timestamp || a.createdAt).getTime());

  return limit ? logs.slice(0, limit) : logs;
}

/**
 * Clear all gate activity logs and reset tenant presence to Inside.
 */
export async function clearGateLogs() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/gate-tap?action=clear_logs`, {
    headers: { apikey: SUPABASE_KEY }
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to clear gate logs.');
  }
  return data;
}

/**
 * Fetch active tenants enriched with presence information and absence flags.
 * Uses Edge Function first to allow unauthenticated kiosks to display the tenant list.
 */
export async function fetchTenantsPresence() {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gate-tap?action=list`, {
      headers: { apikey: SUPABASE_KEY }
    });
    const result = await res.json();
    if (res.ok && Array.isArray(result.tenants)) {
      return result.tenants.map((t) => {
        const gateStatus = t.gateStatus || 'INSIDE';
        const daysAway = gateStatus === 'OUTSIDE' ? computeDaysAway(t.lastGateTapAt) : 0;
        const isAwol = gateStatus === 'OUTSIDE' && daysAway >= ABANDONMENT_THRESHOLD_DAYS;
        return { ...t, daysAway, isAwol };
      });
    }
  } catch (err) {
    console.warn('Edge function list fallback:', err);
  }

  // Fallback to client-side query
  const tenantsRef = supabaseData.collection(supabase, 'tenants');
  const snap = await supabaseData.getDocs(tenantsRef);
  const tenants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const activeTenants = tenants.filter((t) => t.status !== 'Archived');

  return activeTenants.map((t) => {
    const gateStatus = t.gateStatus || 'INSIDE';
    const daysAway = gateStatus === 'OUTSIDE' ? computeDaysAway(t.lastGateTapAt) : 0;
    const isAwol = gateStatus === 'OUTSIDE' && daysAway >= ABANDONMENT_THRESHOLD_DAYS;

    return {
      ...t,
      cardUid: t.cardUid || `NFC-${String(t.room || '101').replace(/\D+/g, '')}`,
      gateStatus,
      daysAway,
      isAwol
    };
  });
}

/**
 * Action: Confirm tenant abandonment / unannounced move-out.
 * Automatically archives the tenant, frees the room slot back to available,
 * and logs an audit trail.
 */
export async function confirmAbandonmentAndReleaseRoom(tenantId, reason = 'Unannounced Move-out / Abandoned') {
  if (!tenantId) throw new Error('Tenant ID is required.');

  const tenantDocRef = supabaseData.doc(supabase, 'tenants', tenantId);
  const snap = await supabaseData.getDoc(tenantDocRef);
  if (!snap.exists()) throw new Error('Tenant not found.');

  const tenant = snap.data();
  const roomName = tenant.room || tenant.dormName || '';
  const nowIso = new Date().toISOString();

  // 1. Mark tenant as archived
  const archivedTenant = {
    ...tenant,
    status: 'Archived',
    archivedReason: reason,
    previousRoom: roomName,
    room: '',
    gateStatus: 'OUTSIDE',
    archivedAt: nowIso,
    updatedAt: nowIso
  };
  await supabaseData.setDoc(tenantDocRef, archivedTenant);

  // 2. Increment room availability if tenant had a room assigned
  if (roomName) {
    const roomsRef = supabaseData.collection(supabase, 'rooms');
    const roomSnap = await supabaseData.getDocs(roomsRef);
    const roomDoc = roomSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .find((r) => r.name === roomName || r.id === roomName);

    if (roomDoc) {
      const currentAvail = Number(roomDoc.available) || 0;
      const targetRoomRef = supabaseData.doc(supabase, 'rooms', roomDoc.id);
      await supabaseData.setDoc(targetRoomRef, {
        ...roomDoc,
        available: currentAvail + 1,
        updatedAt: nowIso
      });
    }
  }

  // 3. Log an audit notification in messages
  const auditId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await supabaseData.setDoc(supabaseData.doc(supabase, 'messages', auditId), {
    type: 'system_notification',
    subject: `[Room Released] ${tenant.name || 'Tenant'} - ${roomName || 'Unit'}`,
    message: `Tenant ${tenant.name || 'Tenant'} was confirmed abandoned/vacated. Room ${roomName || 'Unit'} availability was automatically restored (+1).`,
    timestamp: nowIso,
    createdAt: nowIso
  });

  return { success: true, releasedRoom: roomName };
}
