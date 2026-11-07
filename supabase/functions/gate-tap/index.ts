import { adminClient } from '../_shared/auth.ts';
import { jsonResponse, optionsResponse } from '../_shared/http.ts';

const CURFEW_HOUR_START = 22; // 10:00 PM
const CURFEW_HOUR_END = 5; // 5:00 AM
const GATE_TIMEZONE = 'Asia/Manila';

function getManilaHour(date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: GATE_TIMEZONE,
      hour: 'numeric',
      hour12: false
    }).formatToParts(date);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    if (Number.isFinite(h)) return h === 24 ? 0 : h;
  } catch {}
  return (date.getUTCHours() + 8) % 24;
}

function isCurfewViolation(date = new Date()) {
  const hour = getManilaHour(date);
  return hour >= CURFEW_HOUR_START || hour < CURFEW_HOUR_END;
}

function isUnassignedTenant(data: Record<string, unknown> = {}) {
  const room = String(data.room || data.dormName || '').toLowerCase();
  const status = String(data.status || '').toLowerCase();
  return (
    !room ||
    room.includes('unassigned') ||
    room.includes('pending') ||
    room.includes('needs unit') ||
    status === 'pending assignment' ||
    Boolean(data.needsAssignment)
  );
}

function formatGateTimestamp(isoString: string) {
  if (!isoString) return 'Never';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return 'Never';
  const dateStr = d.toLocaleDateString('en-US', {
    timeZone: GATE_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: GATE_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return `${dateStr} at ${timeStr}`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);

  const admin = adminClient();
  const url = new URL(request.url);

  // 1. Clear Gate Logs & Reset Tenant Presence
  if (url.searchParams.get('action') === 'clear_logs') {
    try {
      const { data: messages, error: msgErr } = await admin
        .from('app_documents')
        .select('id, data')
        .eq('collection', 'messages');

      if (msgErr) throw msgErr;

      const gateMsgIds = (messages || [])
        .filter(
          (m: { id: string; data: Record<string, unknown> }) =>
            m.data?.type === 'gate_log' ||
            m.id.startsWith('gate-') ||
            m.id.startsWith('notif-gate-')
        )
        .map((m: { id: string }) => m.id);

      if (gateMsgIds.length > 0) {
        await admin
          .from('app_documents')
          .delete()
          .eq('collection', 'messages')
          .in('id', gateMsgIds);
      }

      // Reset all tenants to INSIDE and clear tap timestamps (or PENDING if unassigned)
      const { data: tenantDocs, error: tErr } = await admin
        .from('app_documents')
        .select('id, data')
        .eq('collection', 'tenants');

      if (tErr) throw tErr;

      for (const t of tenantDocs || []) {
        if (t.data?.status !== 'Archived') {
          const unassigned = isUnassignedTenant(t.data);
          const updated = {
            ...t.data,
            gateStatus: unassigned ? 'PENDING' : 'INSIDE',
            cardUid: unassigned ? 'PENDING' : t.data.cardUid,
            lastGateTapAt: null,
            lastGateTapType: null
          };
          await admin
            .from('app_documents')
            .update({ data: updated })
            .eq('collection', 'tenants')
            .eq('id', t.id);
        }
      }

      return jsonResponse(request, { success: true, clearedLogsCount: gateMsgIds.length });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to reset gate logs';
      return jsonResponse(request, { error: errorMsg }, 500);
    }
  }

  // 2. GET / List active tenants
  if (request.method === 'GET' || url.searchParams.get('action') === 'list') {
    try {
      const { data: tenantDocs, error } = await admin
        .from('app_documents')
        .select('id, data')
        .eq('collection', 'tenants');

      if (error) throw error;

      const activeTenants = (tenantDocs || [])
        .filter((d: { id: string; data: Record<string, unknown> }) => {
          const data = d.data || {};
          return data.status !== 'Archived' && !isUnassignedTenant(data);
        })
        .map((d: { id: string; data: Record<string, unknown> }) => {
          const roomDigits = String(d.data.room || '').replace(/\D+/g, '');
          const cardUid = String(
            d.data.cardUid || d.data.nfcCardId || (roomDigits ? `NFC-${roomDigits}` : 'PENDING')
          )
            .trim()
            .toUpperCase();
          return {
            id: d.id,
            name: String(d.data.name || 'Tenant').trim(),
            room: String(d.data.room || d.data.dormName || 'Room').trim(),
            cardUid,
            gateStatus: String(d.data.gateStatus || 'INSIDE').toUpperCase(),
            status: String(d.data.status || 'Active')
          };
        });

      return jsonResponse(request, { success: true, tenants: activeTenants });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to query tenants';
      return jsonResponse(request, { error: errorMsg }, 500);
    }
  }

  // 3. POST / Record Gate Tap
  if (request.method === 'POST') {
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      return jsonResponse(request, { error: 'Invalid JSON request.' }, 400);
    }

    const cardUid = String(body.cardUid || body.uid || '')
      .trim()
      .toUpperCase();
    const tenantId = String(body.tenantId || '').trim();
    const explicitDirection = body.direction ? String(body.direction).toUpperCase() : null;

    if (!cardUid && !tenantId) {
      return jsonResponse(request, { error: 'A Card UID or Tenant ID is required.' }, 400);
    }

    try {
      const { data: tenantRows, error: fetchErr } = await admin
        .from('app_documents')
        .select('id, data')
        .eq('collection', 'tenants');

      if (fetchErr) throw fetchErr;

      const tenantDoc = (tenantRows || []).find(
        (row: { id: string; data: Record<string, unknown> }) => {
          const d = (row.data || {}) as Record<string, unknown>;
          if (d.status === 'Archived' || isUnassignedTenant(d)) return false;
          if (tenantId && row.id === tenantId) return true;
          if (cardUid) {
            const existingUid = String(d.cardUid || d.nfcCardId || '')
              .trim()
              .toUpperCase();
            if (existingUid === cardUid) return true;
            const roomDigits = String(d.room || '').replace(/\D+/g, '');
            if (roomDigits && (cardUid === `NFC-${roomDigits}` || cardUid === roomDigits))
              return true;
          }
          return false;
        }
      );

      if (!tenantDoc) {
        const isPendingTenant = (tenantRows || []).some(
          (row: { id: string; data: Record<string, unknown> }) => {
            const d = (row.data || {}) as Record<string, unknown>;
            if (d.status === 'Archived') return false;
            if (tenantId && row.id === tenantId) return isUnassignedTenant(d);
            const existingUid = String(d.cardUid || d.nfcCardId || '')
              .trim()
              .toUpperCase();
            return existingUid === cardUid && isUnassignedTenant(d);
          }
        );
        if (isPendingTenant) {
          return jsonResponse(
            request,
            {
              error:
                'Keycard pending issuance: tenant room assignment is pending administrator approval.'
            },
            400
          );
        }
        return jsonResponse(
          request,
          {
            error: `Unrecognized or inactive keycard: "${cardUid || tenantId}". Please register this card to an active tenant in the Admin Dashboard.`
          },
          404
        );
      }

      const tenantData = (tenantDoc.data || {}) as Record<string, unknown>;
      const currentStatus = String(tenantData.gateStatus || 'INSIDE').toUpperCase();
      const resolvedDirection = explicitDirection || (currentStatus === 'INSIDE' ? 'OUT' : 'IN');

      const now = new Date();
      const nowIso = now.toISOString();
      const isLate = resolvedDirection === 'IN' && isCurfewViolation(now);
      const roomDigits = String(tenantData.room || '').replace(/\D+/g, '');
      const finalCardUid =
        cardUid ||
        String(
          tenantData.cardUid ||
            tenantData.nfcCardId ||
            (roomDigits ? `NFC-${roomDigits}` : 'NFC-101')
        );

      // 1. Insert gate log in messages collection
      const gateLogId = `gate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await admin.from('app_documents').insert({
        collection: 'messages',
        id: gateLogId,
        data: {
          type: 'gate_log',
          tenantId: tenantDoc.id,
          tenantName: tenantData.name || 'Tenant',
          email: tenantData.email || '',
          room: tenantData.room || '',
          cardUid: finalCardUid,
          direction: resolvedDirection,
          timestamp: nowIso,
          isLate,
          source: body.source || 'NFC_KIOSK',
          createdAt: nowIso
        }
      });

      // 2. Insert notification message
      const notifId = `notif-gate-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const statusPhrase = resolvedDirection === 'IN' ? 'INSIDE PREMISES' : 'OUT OF PREMISES';
      const curfewNote = isLate ? ' [CURFEW VIOLATION] Entry logged past 10:00 PM.' : '';

      await admin.from('app_documents').insert({
        collection: 'messages',
        id: notifId,
        data: {
          sender: 'security',
          senderName: 'Home-Spot Gate Security',
          recipient: tenantData.email || '',
          email: tenantData.email || '',
          room: tenantData.room || '',
          subject: `Gate Security Alert: ${tenantData.name || 'Tenant'} is now ${statusPhrase}`,
          message: `Keycard ${finalCardUid} scanned at Main Gate. Physical status updated to: ${statusPhrase} at ${formatGateTimestamp(nowIso)}.${curfewNote}`,
          text: `Keycard ${finalCardUid} scanned at Main Gate. Physical status updated to: ${statusPhrase} at ${formatGateTimestamp(nowIso)}.${curfewNote}`,
          type: 'gate_notification',
          direction: resolvedDirection,
          isLate,
          timestamp: nowIso,
          createdAt: nowIso
        }
      });

      // 3. Update tenant document
      const updatedTenant = {
        ...tenantData,
        cardUid: finalCardUid,
        gateStatus: resolvedDirection === 'IN' ? 'INSIDE' : 'OUTSIDE',
        lastGateTapAt: nowIso,
        lastGateTapType: resolvedDirection,
        updatedAt: nowIso
      };

      await admin
        .from('app_documents')
        .update({ data: updatedTenant })
        .eq('collection', 'tenants')
        .eq('id', tenantDoc.id);

      return jsonResponse(request, {
        success: true,
        tenant: updatedTenant,
        direction: resolvedDirection,
        timestamp: nowIso,
        isLate,
        cardUid: finalCardUid,
        message: `${tenantData.name || 'Tenant'} (${tenantData.room || 'Room'}) is now ${statusPhrase}`
      });
    } catch (tapErr: unknown) {
      const errorMsg = tapErr instanceof Error ? tapErr.message : 'Failed to record gate tap';
      return jsonResponse(request, { error: errorMsg }, 500);
    }
  }

  return jsonResponse(request, { error: 'Method not allowed.' }, 405);
});
