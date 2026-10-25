declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (request: Request) => Promise<Response> | Response): void;
};

import { adminClient, authenticatedUser } from '../_shared/auth.ts';
import { jsonResponse, optionsResponse } from '../_shared/http.ts';

const MAX_AMOUNT_PHP = Number(Deno.env.get('MAX_PAYMENT_AMOUNT') || 200000);
const MERCHANT_NAME = Deno.env.get('MERCHANT_NAME') || 'MJP Residences';

function payMongoAuth() {
  const secret = Deno.env.get('PAYMONGO_SECRET_KEY')?.trim();
  if (!secret) throw new Error('The PayMongo secret key is not configured.');
  return `Basic ${btoa(`${secret}:`)}`;
}

async function payMongoRequest(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`https://api.paymongo.com${path}`, {
    method,
    headers: {
      Authorization: payMongoAuth(),
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('PayMongo returned an invalid response.');
  }
  if (!response.ok) {
    const message = json.errors?.[0]?.detail || 'PayMongo request failed.';
    throw Object.assign(new Error(message), { status: response.status });
  }
  return json;
}

function amountToCentavos(value: unknown) {
  const amount = Number(value);
  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(MAX_AMOUNT_PHP) ||
    MAX_AMOUNT_PHP <= 0 ||
    amount <= 0 ||
    amount > MAX_AMOUNT_PHP
  ) {
    return null;
  }
  return Math.round(amount * 100);
}

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

function allowedReturnUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.hostname.endsWith('.vercel.app') ||
    url.hostname === 'vercel.app' ||
    url.hostname.endsWith('.home-spot.online') ||
    url.hostname === 'home-spot.online'
  ) {
    return url.toString();
  }
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin: string) => origin.trim())
    .filter(Boolean);
  let sbOrigins: string[] = [];
  try {
    const sbUrl = Deno.env.get('SUPABASE_URL');
    if (sbUrl) sbOrigins = [new URL(sbUrl).origin];
  } catch {
    // ignore
  }
  const allowed = new Set([...DEFAULT_ORIGINS, ...sbOrigins, ...configured]);
  return allowed.has(url.origin) || allowed.has('*') ? url.toString() : null;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return optionsResponse(request);
  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  }

  const auth = await authenticatedUser(request);
  if (auth.errorResponse) return auth.errorResponse;
  if (!['tenant', 'admin', 'superadmin'].includes(auth.user.app_metadata?.role)) {
    return jsonResponse(request, { error: 'This account cannot request payments.' }, 403);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return jsonResponse(request, { error: 'Invalid JSON request.' }, 400);
  }

  try {
    switch (input.action) {
      case 'create-checkout': {
        const amount = amountToCentavos(input.amount);
        const successUrl = allowedReturnUrl(input.successUrl);
        const cancelUrl = allowedReturnUrl(input.cancelUrl);
        if (amount === null || !successUrl || !cancelUrl) {
          return jsonResponse(request, { error: 'Invalid amount or return URL.' }, 400);
        }
        const purpose =
          typeof input.purpose === 'string' ? input.purpose.slice(0, 120) : 'Monthly Rent';
        const notes = typeof input.notes === 'string' ? input.notes.slice(0, 500) : '';
        const requestedMethods = Array.isArray(input.payment_method_types)
          ? input.payment_method_types
          : ['card', 'paymaya', 'grab_pay', 'gcash', 'qrph'];
        const allowedMethods = ['card', 'paymaya', 'grab_pay', 'gcash', 'qrph'];
        const methods = requestedMethods.filter(
          (method): method is string =>
            typeof method === 'string' && allowedMethods.includes(method)
        );
        if (!methods.length)
          return jsonResponse(request, { error: 'No valid payment methods.' }, 400);

        const description = notes
          ? `${purpose} (${notes}) - ${MERCHANT_NAME}`
          : `${purpose} - ${MERCHANT_NAME}`;
        const data = await payMongoRequest('/v1/checkout_sessions', 'POST', {
          data: {
            attributes: {
              send_email_receipt: true,
              show_description: true,
              show_line_items: true,
              description,
              line_items: [
                {
                  currency: 'PHP',
                  amount,
                  name: purpose,
                  description: notes ? `Notes: ${notes}` : `Payment for ${purpose}`,
                  quantity: 1
                }
              ],
              payment_method_types: methods,
              billing: {
                name: typeof input.tenantName === 'string' ? input.tenantName.slice(0, 120) : '',
                email: auth.user.email || '',
                phone: typeof input.tenantPhone === 'string' ? input.tenantPhone.slice(0, 64) : ''
              },
              metadata: { supabaseUserId: auth.user.id, tenantEmail: auth.user.email || '' },
              success_url: successUrl,
              cancel_url: cancelUrl
            }
          }
        });
        return jsonResponse(request, { data: data.data });
      }

      case 'create-link': {
        const amount = amountToCentavos(input.amount);
        if (amount === null) return jsonResponse(request, { error: 'Invalid amount.' }, 400);
        const data = await payMongoRequest('/v1/links', 'POST', {
          data: {
            attributes: {
              amount,
              description:
                typeof input.description === 'string'
                  ? input.description.slice(0, 255)
                  : 'Rent Payment',
              remarks:
                typeof input.remarks === 'string' ? input.remarks.slice(0, 255) : MERCHANT_NAME
            }
          }
        });
        return jsonResponse(request, { data: data.data });
      }

      case 'checkout-status': {
        if (typeof input.id !== 'string' || !input.id.startsWith('cs_')) {
          return jsonResponse(request, { error: 'Invalid checkout session.' }, 400);
        }
        const data = await payMongoRequest(`/v1/checkout_sessions/${encodeURIComponent(input.id)}`);
        const ownerId = data.data?.attributes?.metadata?.supabaseUserId;
        const ownerEmail =
          data.data?.attributes?.metadata?.tenantEmail || data.data?.attributes?.billing?.email;
        const isStaff = ['admin', 'superadmin'].includes(auth.user.app_metadata?.role);
        const isOwner =
          (ownerId && ownerId === auth.user.id) ||
          (ownerEmail &&
            typeof ownerEmail === 'string' &&
            ownerEmail.toLowerCase() === (auth.user.email || '').toLowerCase());
        if (!isOwner && !isStaff) {
          return jsonResponse(request, { error: 'Checkout session not found.' }, 404);
        }

        // Auto-record paid checkout session on backend using service role
        const sessionAttrs = data.data?.attributes;
        const payments = Array.isArray(sessionAttrs?.payments) ? sessionAttrs.payments : [];
        const isPaid =
          sessionAttrs?.status === 'paid' ||
          payments.some((p: Record<string, any>) => p?.attributes?.status === 'paid') ||
          sessionAttrs?.payment_intent?.attributes?.status === 'succeeded';

        if (isPaid) {
          try {
            const admin = adminClient();
            const relatedPayment = payments[0] || null;
            const rawSessionId = typeof data.data?.id === 'string' ? data.data.id : '';
            const paymentId = relatedPayment?.id || rawSessionId;
            const canonicalDocId = rawSessionId.startsWith('cs_') ? rawSessionId : paymentId;
            const lineItemsAmount = Array.isArray(sessionAttrs?.line_items)
              ? sessionAttrs.line_items.reduce(
                (sum: number, item: { amount?: number; quantity?: number }) =>
                  sum + Number(item.amount || 0) * Number(item.quantity || 1),
                0
              )
              : 0;
            const amountInCentavos = Number(
              relatedPayment?.attributes?.amount || sessionAttrs?.amount || lineItemsAmount
            );
            const tenantEmail =
              auth.user.email ||
              sessionAttrs?.metadata?.tenantEmail ||
              sessionAttrs?.billing?.email ||
              '';
            const tenantName =
              sessionAttrs?.billing?.name || sessionAttrs?.metadata?.tenantName || 'Tenant';
            const lineItemName =
              Array.isArray(sessionAttrs?.line_items) &&
              typeof sessionAttrs.line_items[0]?.name === 'string' &&
              sessionAttrs.line_items[0].name.trim();
            const cleanPurpose =
              lineItemName ||
              (sessionAttrs?.description || 'Monthly Rent').replace(/\s*-\s*MJP Residences\s*$/i, '').trim();
            const referenceNumber = `PM-${canonicalDocId.slice(-6).toUpperCase()}`;
            const now = new Date();
            const record = {
              payMongoResourceId: paymentId,
              sessionId: rawSessionId || null,
              referenceNumber,
              amount: amountInCentavos > 0 ? amountInCentavos / 100 : 5000,
              currency: 'PHP',
              status: 'Paid',
              purpose: cleanPurpose,
              notes: sessionAttrs?.metadata?.notes || 'Completed via PayMongo Checkout',
              method:
                relatedPayment?.attributes?.payment_method_type ||
                relatedPayment?.attributes?.source?.type ||
                'PayMongo Checkout',
              tenantEmail,
              tenantUid: auth.user.id,
              tenantName,
              dateFormatted: now.toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short'
              }),
              timestamp: now.toISOString(),
              createdAt: now.toISOString()
            };
            await admin
              .from('app_documents')
              .upsert(
                { collection: 'payments', id: canonicalDocId, data: record },
                { onConflict: 'collection,id' }
              );
            await admin
              .from('payments')
              .upsert(
                {
                  id: referenceNumber,
                  session_id: canonicalDocId,
                  tenant_name: record.tenantName,
                  tenant_email: record.tenantEmail,
                  tenant_uid: auth.user.id,
                  amount: record.amount,
                  status: 'Paid',
                  payment_method: record.method,
                  purpose: record.purpose,
                  notes: record.notes,
                  reference_number: referenceNumber,
                  created_at: record.createdAt
                },
                { onConflict: 'id' }
              )
              .catch(() => null);
          } catch (e) {
            console.warn('Backend payment auto-sync failed (non-blocking):', e);
          }
        }

        return jsonResponse(request, { data: data.data });
      }

      case 'expire-checkout': {
        if (typeof input.id !== 'string' || !input.id.startsWith('cs_')) {
          return jsonResponse(request, { error: 'Invalid checkout session.' }, 400);
        }
        const session = await payMongoRequest(
          `/v1/checkout_sessions/${encodeURIComponent(input.id)}`
        );
        const ownerId = session.data?.attributes?.metadata?.supabaseUserId;
        const isStaff = ['admin', 'superadmin'].includes(auth.user.app_metadata?.role);
        if (ownerId !== auth.user.id && !isStaff) {
          return jsonResponse(request, { error: 'Checkout session not found.' }, 404);
        }
        const data = await payMongoRequest(
          `/v1/checkout_sessions/${encodeURIComponent(input.id)}/expire`,
          'POST',
          { data: { attributes: {} } }
        );
        return jsonResponse(request, { data: data.data });
      }

      case 'payment-intent-status': {
        if (typeof input.id !== 'string' || !input.id.startsWith('pi_')) {
          return jsonResponse(request, { error: 'Invalid payment intent.' }, 400);
        }
        const data = await payMongoRequest(`/v1/payment_intents/${encodeURIComponent(input.id)}`);
        const metadata = data.data?.attributes?.metadata;
        const ownerId = metadata?.supabaseUserId;
        const tenantEmail = metadata?.tenantEmail;
        const isStaff = ['admin', 'superadmin'].includes(auth.user.app_metadata?.role);
        const isOwner =
          ownerId === auth.user.id || (Boolean(tenantEmail) && tenantEmail === auth.user.email);
        if (!isOwner && !isStaff) {
          return jsonResponse(request, { error: 'Payment intent not found.' }, 404);
        }
        return jsonResponse(request, { data: data.data });
      }

      case 'complete-qr-payment':
        return jsonResponse(
          request,
          { error: 'QR payments are settled by PayMongo and cannot be manually marked paid.' },
          403
        );

      default:
        return jsonResponse(request, { error: 'Unknown payment operation.' }, 400);
    }
  } catch (error) {
    console.error('PayMongo Edge Function failed:', error);
    const status = Number((error as { status?: number }).status);
    return jsonResponse(
      request,
      { error: error instanceof Error ? error.message : 'Payment request failed.' },
      status >= 400 && status < 500 ? status : 502
    );
  }
});
