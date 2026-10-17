import { authenticatedUser } from '../_shared/auth.ts';
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

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function allowedReturnUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowed = new Set([...DEFAULT_ORIGINS, ...configured]);
  return allowed.has(url.origin) ? url.toString() : null;
}

Deno.serve(async (request) => {
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
          : ['card', 'paymaya', 'grab_pay', 'qrph'];
        const allowedMethods = ['card', 'paymaya', 'grab_pay', 'qrph'];
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
        const isStaff = ['admin', 'superadmin'].includes(auth.user.app_metadata?.role);
        if (ownerId !== auth.user.id && !isStaff) {
          return jsonResponse(request, { error: 'Checkout session not found.' }, 404);
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
