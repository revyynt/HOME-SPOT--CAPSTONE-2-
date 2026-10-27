import { adminClient } from '../_shared/auth.ts';
import { jsonResponse } from '../_shared/http.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatPayMongoMethod(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const lower = candidate.trim().toLowerCase();
    if (lower.includes('gcash')) return 'PayMongo Checkout (GCash)';
    if (lower.includes('paymaya') || lower.includes('maya')) return 'PayMongo Checkout (Maya)';
    if (lower.includes('qrph') || lower.includes('qr_ph') || lower.includes('qr ph')) {
      return 'PayMongo Checkout (QR Ph)';
    }
    if (lower.includes('grab_pay') || lower.includes('grabpay') || lower.includes('grab pay')) {
      return 'PayMongo Checkout (GrabPay)';
    }
    if (
      lower.includes('card') ||
      lower.includes('credit') ||
      lower.includes('debit') ||
      lower.includes('visa') ||
      lower.includes('mastercard') ||
      lower.includes('3ds')
    ) {
      return 'PayMongo Checkout (Card)';
    }
  }
  return 'PayMongo Checkout';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  }

  const secret = Deno.env.get('WEBHOOK_SECRET')?.trim();
  const provided =
    request.headers.get('x-webhook-secret') || new URL(request.url).searchParams.get('secret');
  if (!secret || provided !== secret) {
    return jsonResponse(request, { error: 'Invalid webhook secret.' }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid webhook payload.' }, 400);
  }

  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    !isRecord(payload.data.attributes) ||
    typeof payload.data.attributes.type !== 'string'
  ) {
    return jsonResponse(request, { error: 'Invalid PayMongo event structure.' }, 400);
  }

  const event = payload.data.attributes;
  const eventType = event.type;
  const isPaid = eventType === 'payment.paid' || eventType === 'checkout_session.payment.paid';
  const isFailed =
    eventType === 'payment.failed' || eventType === 'checkout_session.payment.failed';
  if (!isPaid && !isFailed) return jsonResponse(request, { received: true, event: eventType });

  if (!isRecord(event.data)) {
    return jsonResponse(request, { error: 'PayMongo event has no payment resource.' }, 400);
  }
  const resource = event.data;
  const attributes = isRecord(resource.attributes) ? resource.attributes : {};
  const relatedPayment =
    Array.isArray(attributes.payments) && isRecord(attributes.payments[0])
      ? attributes.payments[0]
      : null;
  const paymentAttributes = isRecord(relatedPayment?.attributes)
    ? relatedPayment.attributes
    : attributes;
  const eventId = payload.data.id;
  if (typeof eventId !== 'string' || !eventId) {
    return jsonResponse(request, { error: 'PayMongo event id is required.' }, 400);
  }
  const rawResourceId = typeof resource.id === 'string' ? resource.id : '';
  const paymentId =
    (typeof relatedPayment?.id === 'string' && relatedPayment.id) || rawResourceId;
  if (typeof paymentId !== 'string' || !paymentId) {
    return jsonResponse(request, { error: 'PayMongo payment id is required.' }, 400);
  }
  const canonicalDocId = rawResourceId.startsWith('cs_') ? rawResourceId : paymentId;

  const billing = isRecord(paymentAttributes.billing)
    ? paymentAttributes.billing
    : isRecord(attributes.billing)
      ? attributes.billing
      : {};
  const metadata = isRecord(paymentAttributes.metadata)
    ? paymentAttributes.metadata
    : isRecord(attributes.metadata)
      ? attributes.metadata
      : {};
  const failure = isRecord(paymentAttributes.last_payment_error)
    ? paymentAttributes.last_payment_error
    : isRecord(attributes.last_payment_error)
      ? attributes.last_payment_error
      : {};
  const lineItemsAmount = Array.isArray(attributes.line_items)
    ? attributes.line_items.reduce(
      (sum: number, item: { amount?: number; quantity?: number }) =>
        sum + Number(item.amount || 0) * Number(item.quantity || 1),
      0
    )
    : 0;
  const amountInCentavos = Number(paymentAttributes.amount || attributes.amount || lineItemsAmount);
  if (!Number.isFinite(amountInCentavos) || amountInCentavos <= 0) {
    return jsonResponse(request, { error: 'PayMongo event has no valid payment amount.' }, 400);
  }
  const tenantEmail =
    (typeof billing.email === 'string' && billing.email) ||
    (typeof metadata.tenantEmail === 'string' && metadata.tenantEmail) ||
    '';
  const tenantUid = typeof metadata.supabaseUserId === 'string' ? metadata.supabaseUserId : '';
  if (!tenantEmail && !tenantUid) {
    return jsonResponse(request, { error: 'PayMongo event has no tenant identity.' }, 400);
  }
  const description =
    (typeof attributes.description === 'string' && attributes.description) ||
    (typeof paymentAttributes.description === 'string' && paymentAttributes.description) ||
    '';
  const paymentMethod = formatPayMongoMethod(
    isRecord(paymentAttributes.source) ? paymentAttributes.source.type : '',
    paymentAttributes.payment_method_type,
    attributes.payment_method_used,
    metadata.preferredMethod,
    Array.isArray(attributes.payment_method_types) && attributes.payment_method_types.length === 1
      ? attributes.payment_method_types[0]
      : ''
  );
  const now = new Date();
  const firstLineItem = Array.isArray(attributes.line_items) && isRecord(attributes.line_items[0]) ? attributes.line_items[0] : null;
  const lineItemName = typeof firstLineItem?.name === 'string' ? firstLineItem.name.trim() : '';
  const cleanPurpose =
    lineItemName ||
    description.replace(/\s*-\s*MJP Residences\s*$/i, '').trim() ||
    'Monthly Rent';
  const referenceNumber = `PM-${canonicalDocId.slice(-6).toUpperCase()}`;

  const record = {
    payMongoEventId: eventId,
    payMongoResourceId: paymentId,
    sessionId: rawResourceId.startsWith('cs_') ? rawResourceId : null,
    eventType,
    referenceNumber,
    amount: amountInCentavos / 100,
    currency:
      (typeof paymentAttributes.currency === 'string' && paymentAttributes.currency) ||
      (typeof attributes.currency === 'string' && attributes.currency) ||
      'PHP',
    status: isPaid ? 'Paid' : 'Failed',
    description,
    purpose: cleanPurpose,
    method: paymentMethod,
    tenantEmail,
    tenantUid,
    tenantName: typeof billing.name === 'string' ? billing.name : '',
    failureCode:
      (typeof attributes.failed_code === 'string' && attributes.failed_code) ||
      (typeof failure.failed_code === 'string' && failure.failed_code) ||
      null,
    failureReason:
      (typeof attributes.failed_message === 'string' && attributes.failed_message) ||
      (typeof failure.failed_message === 'string' && failure.failed_message) ||
      (typeof failure.detail === 'string' && failure.detail) ||
      null,
    dateFormatted: now.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }),
    timestamp: now.toISOString(),
    createdAt: now.toISOString()
  };

  const admin = adminClient();
  const { error } = await admin
    .from('app_documents')
    .upsert(
      { collection: 'payments', id: canonicalDocId, data: record },
      { onConflict: 'collection,id' }
    );

  if (isPaid) {
    await admin
      .from('payments')
      .upsert(
        {
          id: referenceNumber,
          session_id: canonicalDocId,
          tenant_name: record.tenantName,
          tenant_email: record.tenantEmail,
          tenant_uid: tenantUid || null,
          amount: record.amount,
          status: 'Paid',
          payment_method: record.method,
          purpose: record.purpose,
          notes: description || null,
          reference_number: referenceNumber,
          created_at: record.createdAt
        },
        { onConflict: 'id' }
      )
      .catch(() => null);
  }
  if (error) {
    console.error('Could not persist PayMongo webhook event:', error);
    return jsonResponse(request, { error: 'Could not record the payment event.' }, 500);
  }

  return jsonResponse(request, { received: true, event: eventType });
});
