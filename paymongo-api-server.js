/**
 * HomeSpot PayMongo API Bridge & Development Server
 *
 * Every secret is read from the environment (see .env.example). The server
 * refuses to start without PAYMONGO_SECRET_KEY -- there are no code fallbacks,
 * because a hardcoded key ends up in git and in the browser bundle.
 *
 * Usage: node paymongo-api-server.js [port]
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

// Minimal .env loader so the project stays dependency-free. Real environment
// variables always win over the file.
function loadEnvFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return; // no .env is fine
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(path.join(__dirname, '.env'));

function requireEnv(name) {
  const value = (process.env[name] || '').trim();
  if (!value) {
    console.error(`\n[config] Missing required environment variable ${name}.`);
    console.error(`[config] Copy .env.example to .env and fill it in, then retry.\n`);
    process.exit(1);
  }
  return value;
}

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

const PORT = Number(process.env.PORT || process.argv[2] || 5050);
const PAYMONGO_SECRET_KEY = requireEnv('PAYMONGO_SECRET_KEY');
const PAYMONGO_AUTH = 'Basic ' + Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64');

// Firebase ID-token verification via the public Identity Toolkit REST API.
// This keeps the server dependency-free while still validating real Firebase
// sessions instead of trusting whatever the browser claims to be.
const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || '').trim();
const FIREBASE_API_KEY = (process.env.FIREBASE_API_KEY || '').trim();
const REQUIRE_AUTH = boolEnv('REQUIRE_AUTH', true);

// QR Ph settlement must never be auto-charged without an explicit opt-in; see
// /api/complete-qr-payment. Off by default so the endpoint cannot be used as a
// "mark any amount as paid" bypass.
const ALLOW_TEST_AUTO_CHARGE = boolEnv('ALLOW_TEST_AUTO_CHARGE', false);

if (REQUIRE_AUTH && (!FIREBASE_PROJECT_ID || !FIREBASE_API_KEY)) {
  console.error(
    '\n[config] REQUIRE_AUTH is on but FIREBASE_PROJECT_ID / FIREBASE_API_KEY are unset.'
  );
  console.error('[config] Set them in .env, or export REQUIRE_AUTH=false for local-only testing.');
  console.error('[config] NOTE: REQUIRE_AUTH=false leaves every payment route open to anyone.\n');
  process.exit(1);
}

// Optional shared secret for inbound webhooks. PayMongo does not sign payloads,
// so an unguessable path/header is the only available control.
const WEBHOOK_SECRET = (process.env.WEBHOOK_SECRET || '').trim();

const DEFAULT_ORIGINS = [
  'http://localhost:5050',
  'http://127.0.0.1:5050',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);

const receivedWebhookEvents = [];

const MERCHANT_NAME = process.env.MERCHANT_NAME || 'MJP Residences';
const MAX_AMOUNT_PHP = Number(process.env.MAX_PAYMENT_AMOUNT || 200000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  // Documentation is linked from start.html. Served as plain text -- it will not
  // render as GitHub-flavoured markdown, but it is far better than a 404.
  '.md': 'text/markdown; charset=utf-8'
};

// Directories and filenames that must never be served over HTTP. The static
// handler below resolves paths inside the project root, so without this an
// attacker could simply GET /paymongo-api-server.js or /functions/index.js.
const BLOCKED_PATH_SEGMENTS = new Set([
  'node_modules',
  'functions',
  'src',
  'dataconnect',
  '.git',
  '.firebase'
]);
const BLOCKED_FILENAMES = new Set([
  'package.json',
  'package-lock.json',
  'firebase.json',
  'firestore.rules',
  'firestore.indexes.json',
  'database.rules.json',
  '.firebaserc',
  '.gitignore',
  '.env'
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveCorsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function corsHeaders(req) {
  const origin = resolveCorsOrigin(req);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Private-Network': 'true'
  };
}

function sendJson(req, res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(req)
  });
  res.end(JSON.stringify(data));
}

/**
 * Validates a peso amount coming from an untrusted request body.
 * Returns centavos, or null when the amount is unusable.
 */
function toCentavos(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (amount > MAX_AMOUNT_PHP) return null;
  return Math.round(amount * 100);
}

function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(Object.assign(new Error('Payload too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (err) {
        reject(Object.assign(new Error('Invalid JSON payload'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function payMongoGet(apiPath, callback) {
  const req = https.request(
    {
      hostname: 'api.paymongo.com',
      path: apiPath,
      method: 'GET',
      headers: { Authorization: PAYMONGO_AUTH }
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          callback(null, res.statusCode, JSON.parse(body));
        } catch (err) {
          callback(null, res.statusCode, {
            error: 'Invalid JSON response from PayMongo',
            raw: body
          });
        }
      });
    }
  );
  req.on('error', (err) => callback(err, 500, { error: err.message }));
  req.end();
}

function payMongoPost(apiPath, payload, callback) {
  const data = JSON.stringify(payload);
  const req = https.request(
    {
      hostname: 'api.paymongo.com',
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: PAYMONGO_AUTH,
        'Content-Length': Buffer.byteLength(data)
      }
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          callback(null, res.statusCode, JSON.parse(body));
        } catch (err) {
          callback(null, res.statusCode, {
            error: 'Invalid JSON response from PayMongo',
            raw: body
          });
        }
      });
    }
  );
  req.on('error', (err) => callback(err, 500, { error: err.message }));
  req.write(data);
  req.end();
}

async function payMongoFetch(method, urlPath, body, auth = PAYMONGO_AUTH) {
  const res = await fetch(`https://api.paymongo.com${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    json = { error: 'Invalid JSON response from PayMongo', raw: text };
  }
  return { status: res.status, json };
}

/**
 * Verifies a Firebase ID token and resolves to its claims, or null.
 */
async function verifyIdToken(idToken) {
  if (!idToken) return null;
  const endpoint =
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}:verifyIdToken` +
    `?key=${encodeURIComponent(FIREBASE_API_KEY)}`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    if (!res.ok) return null;
    const claims = await res.json();
    // Reject disabled/expired accounts.
    if (claims.valid === false) return null;
    if (typeof claims.sub !== 'string' || claims.sub === '') return null;
    return claims;
  } catch (err) {
    console.error('[auth] token verification failed:', err.message);
    return null;
  }
}

/**
 * Gate for every /api route. Reads `Authorization: Bearer <firebase idToken>`.
 * Attaches the decoded claims to `req.auth`.
 */
async function requireAuth(req, res) {
  if (!REQUIRE_AUTH) {
    req.auth = null;
    return true;
  }
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    sendJson(req, res, 401, { error: 'Missing Firebase ID token' });
    return false;
  }
  const claims = await verifyIdToken(match[1]);
  if (!claims) {
    sendJson(req, res, 401, { error: 'Invalid or expired Firebase ID token' });
    return false;
  }
  req.auth = claims;
  return true;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handleApi(req, res, pathname, query) {
  // Inbound PayMongo webhooks cannot present a user token.
  if (pathname === '/api/paymongo-webhook' || pathname === '/api/webhook') {
    if (req.method !== 'POST') {
      return sendJson(req, res, 405, { error: 'Method not allowed' });
    }
    if (WEBHOOK_SECRET) {
      const provided = req.headers['x-webhook-secret'] || query.secret || '';
      if (provided !== WEBHOOK_SECRET) {
        return sendJson(req, res, 401, { error: 'Invalid webhook secret' });
      }
    } else {
      console.warn('[webhook] WEBHOOK_SECRET is not set -- webhook endpoint is unauthenticated.');
    }

    let params;
    try {
      params = await readJsonBody(req);
    } catch (err) {
      return sendJson(req, res, err.statusCode || 400, { error: err.message });
    }

    const eventObj = params.data?.attributes || {};
    const eventType = eventObj.type || 'unknown.event';
    const eventResource = eventObj.data?.attributes || {};
    const eventId = params.data?.id || 'evt_' + Date.now();
    const resourceId = eventObj.data?.id || 'res_unknown';
    const amountCentavos = eventResource.amount || 0;
    const amountPhp = (amountCentavos / 100).toFixed(2);
    const failureCode =
      eventResource.failed_code || eventResource.last_payment_error?.failed_code || null;
    const failureMessage =
      eventResource.failed_message ||
      eventResource.last_payment_error?.failed_message ||
      eventResource.last_payment_error?.detail ||
      null;
    const billing = eventResource.billing || {};

    const summary = {
      eventId,
      eventType,
      resourceId,
      status:
        eventType === 'payment.failed'
          ? 'Failed'
          : eventType.includes('paid')
            ? 'Paid'
            : 'Processed',
      amount: parseFloat(amountPhp),
      currency: eventResource.currency || 'PHP',
      description: eventResource.description || '',
      tenantName: billing.name || 'Tenant',
      tenantEmail: billing.email || '',
      failureCode,
      failureReason: failureMessage,
      receivedAt: new Date().toISOString()
    };

    receivedWebhookEvents.unshift(summary);
    if (receivedWebhookEvents.length > 50) receivedWebhookEvents.pop();

    console.log(
      `[webhook] ${eventType} ${eventId} amount=PHP${amountPhp} status=${summary.status}`
    );

    return sendJson(req, res, 200, {
      success: true,
      message: 'Webhook processed successfully',
      eventType,
      eventId
    });
  }

  // Everything below requires a valid Firebase session.
  if (!(await requireAuth(req, res))) return;

  switch (`${req.method} ${pathname}`) {
    // -----------------------------------------------------------------------
    case 'POST /api/create-checkout': {
      let params;
      try {
        params = await readJsonBody(req);
      } catch (err) {
        return sendJson(req, res, err.statusCode || 400, { error: err.message });
      }

      const amountCentavos = toCentavos(params.amount);
      if (amountCentavos === null) {
        return sendJson(req, res, 400, {
          error: `Invalid amount. Expected a value between 0 and ${MAX_AMOUNT_PHP}.`
        });
      }

      const purpose = params.purpose || params.description || 'Monthly Rent';
      const notes = (params.notes || '').toString().trim();
      const sessionDescription =
        params.description ||
        (notes ? `${purpose} (${notes}) - ${MERCHANT_NAME}` : `${purpose} - ${MERCHANT_NAME}`);
      const itemDescription = notes
        ? `Notes: ${notes}`
        : `Payment for ${purpose} - ${MERCHANT_NAME}`;

      const payload = {
        data: {
          attributes: {
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            description: sessionDescription,
            line_items: [
              {
                currency: 'PHP',
                amount: amountCentavos,
                name: purpose,
                description: itemDescription,
                quantity: 1
              }
            ],
            payment_method_types: (
              params.payment_method_types || ['card', 'paymaya', 'grab_pay', 'qrph']
            ).filter((m) => m !== 'dob' && m !== 'billease'),
            billing: {
              name: params.tenantName || undefined,
              email: params.tenantEmail || undefined,
              phone: params.tenantPhone || undefined
            },
            metadata: {
              purpose,
              notes,
              tenantName: params.tenantName || '',
              tenantEmail: params.tenantEmail || '',
              // Lets the webhook reconcile a payment back to the payer.
              firebaseUid: req.auth ? req.auth.sub : ''
            },
            success_url:
              params.successUrl || `http://localhost:${PORT}/tenant-portal.html?payment=success`,
            cancel_url:
              params.cancelUrl || `http://localhost:${PORT}/tenant-portal.html?payment=failed`
          }
        }
      };

      return payMongoPost('/v1/checkout_sessions', payload, (err, status, json) => {
        if (err) return sendJson(req, res, 500, { error: err.message });
        sendJson(req, res, status, json);
      });
    }

    // -----------------------------------------------------------------------
    case 'GET /api/checkout-status': {
      const sessionId = query.id;
      if (!sessionId || !/^cs_[A-Za-z0-9]+$/.test(sessionId)) {
        return sendJson(req, res, 400, { error: 'Valid session ID is required' });
      }
      return payMongoGet(`/v1/checkout_sessions/${sessionId}`, (err, status, json) => {
        if (err) return sendJson(req, res, 500, { error: err.message });
        sendJson(req, res, status, json);
      });
    }

    // -----------------------------------------------------------------------
    case 'POST /api/expire-checkout':
    case 'GET /api/expire-checkout': {
      const sessionId = query.id || query.sessionId;
      if (!sessionId || !/^cs_[A-Za-z0-9]+$/.test(sessionId)) {
        return sendJson(req, res, 400, { error: 'Valid session ID is required' });
      }
      return payMongoPost(
        `/v1/checkout_sessions/${sessionId}/expire`,
        { data: { attributes: {} } },
        (err, status, json) => {
          if (err) return sendJson(req, res, 500, { error: err.message });
          sendJson(req, res, status, json);
        }
      );
    }

    // -----------------------------------------------------------------------
    case 'POST /api/create-card-intent': {
      let params;
      try {
        params = await readJsonBody(req);
      } catch (err) {
        return sendJson(req, res, err.statusCode || 400, { error: err.message });
      }

      const amountCentavos = toCentavos(params.amount);
      if (amountCentavos === null) {
        return sendJson(req, res, 400, {
          error: `Invalid amount. Expected a value between 0 and ${MAX_AMOUNT_PHP}.`
        });
      }

      // Raw PAN/CVC must never be accepted here -- that keeps this server (and
      // its logs) inside PCI scope. Tokenization happens in the browser with the
      // public key via PayMongo's client-side library.
      if (params.cardNumber || params.cvc) {
        return sendJson(req, res, 400, {
          error:
            'Raw card details are not accepted. Tokenize the card client-side with the public key.'
        });
      }

      const purpose = params.purpose || params.description || 'Monthly Rent';

      // 1. PaymentIntent
      const pi = await payMongoFetch('POST', '/v1/payment_intents', {
        data: {
          attributes: {
            amount: amountCentavos,
            payment_method_allowed: ['card'],
            payment_method_options: { card: { request_three_d_secure: 'any' } },
            currency: 'PHP',
            description: `${purpose} - ${MERCHANT_NAME}`,
            metadata: {
              firebaseUid: req.auth ? req.auth.sub : '',
              purpose
            }
          }
        }
      });
      const piId = pi.json.data?.id;
      const clientKey = pi.json.data?.attributes?.client_key;
      if (!piId) {
        return sendJson(req, res, 400, {
          error: 'Failed to create payment intent',
          details: pi.json
        });
      }

      // 2. PaymentMethod, created with the *public* key and a tokenized card id.
      const paymentMethodId = params.paymentMethodId;
      if (!paymentMethodId || !/^pm_[A-Za-z0-9]+$/.test(paymentMethodId)) {
        return sendJson(req, res, 400, {
          error: 'A tokenized PayMongo paymentMethodId is required (create it client-side).'
        });
      }

      // 3. Attach
      const returnUrl = params.returnUrl
        ? String(params.returnUrl).split('?')[0]
        : `http://localhost:${PORT}/tenant-portal.html`;
      const attach = await payMongoFetch('POST', `/v1/payment_intents/${piId}/attach`, {
        data: {
          attributes: {
            payment_method: paymentMethodId,
            client_key: clientKey,
            return_url: returnUrl
          }
        }
      });

      return sendJson(req, res, 200, {
        paymentIntentId: piId,
        status: attach.json.data?.attributes?.status,
        nextActionUrl: attach.json.data?.attributes?.next_action?.redirect?.url,
        returnUrl,
        referenceNumber: 'PM-CARD-' + piId.slice(-6).toUpperCase()
      });
    }

    // -----------------------------------------------------------------------
    case 'GET /api/payment-intent-status': {
      const piId = query.id;
      if (!piId || !/^pi_[A-Za-z0-9]+$/.test(piId)) {
        return sendJson(req, res, 400, { error: 'Valid Payment Intent ID is required' });
      }
      return payMongoGet(`/v1/payment_intents/${piId}`, (err, status, json) => {
        if (err) return sendJson(req, res, 500, { error: err.message });
        sendJson(req, res, status, json);
      });
    }

    // -----------------------------------------------------------------------
    case 'POST /api/complete-qr-payment': {
      if (!ALLOW_TEST_AUTO_CHARGE) {
        return sendJson(req, res, 403, {
          error:
            'Auto-charge settlement is disabled. QR Ph payments settle through the PayMongo ' +
            'checkout redirect or webhook. Set ALLOW_TEST_AUTO_CHARGE=true only for local demos.'
        });
      }

      let params;
      try {
        params = await readJsonBody(req);
      } catch (err) {
        return sendJson(req, res, err.statusCode || 400, { error: err.message });
      }

      const amountCentavos = toCentavos(params.amount);
      if (amountCentavos === null) {
        return sendJson(req, res, 400, {
          error: `Invalid amount. Expected a value between 0 and ${MAX_AMOUNT_PHP}.`
        });
      }

      const description = params.description || 'Rent Payment (QR Ph)';

      const sourceRes = await payMongoFetch('POST', '/v1/sources', {
        data: {
          attributes: {
            type: 'gcash',
            amount: amountCentavos,
            currency: 'PHP',
            description,
            redirect: {
              success: `http://localhost:${PORT}/tenant-portal.html?payment=success`,
              failed: `http://localhost:${PORT}/tenant-portal.html?payment=failed`
            }
          }
        }
      });
      const sourceId = sourceRes.json.data?.id;
      if (!sourceId) {
        return sendJson(req, res, 400, {
          error: 'Failed to initialize payment source',
          details: sourceRes.json
        });
      }

      // Simulates the wallet approving the charge. Test-mode only.
      await fetch(`https://secure-authentication-api.paymongo.com/sources/${sourceId}/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const payRes = await payMongoFetch('POST', '/v1/payments', {
        data: {
          attributes: {
            amount: amountCentavos,
            currency: 'PHP',
            description,
            source: { id: sourceId, type: 'source' }
          }
        }
      });

      const payment = payRes.json.data;
      if (!payment || !payment.id) {
        return sendJson(req, res, 500, {
          error: 'Failed to finalize PayMongo payment',
          details: payRes.json
        });
      }

      return sendJson(req, res, 200, {
        success: true,
        paymentId: payment.id,
        status: payment.attributes?.status || 'paid',
        amount: params.amount,
        referenceNumber: 'PM-QR-' + payment.id.slice(-6).toUpperCase()
      });
    }

    // -----------------------------------------------------------------------
    case 'POST /api/create-link': {
      let params;
      try {
        params = await readJsonBody(req);
      } catch (err) {
        return sendJson(req, res, err.statusCode || 400, { error: err.message });
      }

      const amountCentavos = toCentavos(params.amount);
      if (amountCentavos === null) {
        return sendJson(req, res, 400, {
          error: `Invalid amount. Expected a value between 0 and ${MAX_AMOUNT_PHP}.`
        });
      }

      const payload = {
        data: {
          attributes: {
            amount: amountCentavos,
            description: params.description || 'Rent Payment',
            remarks: params.remarks || `HomeSpot ${MERCHANT_NAME}`
          }
        }
      };

      return payMongoPost('/v1/links', payload, (err, status, json) => {
        if (err) return sendJson(req, res, 500, { error: err.message });
        sendJson(req, res, status, json);
      });
    }

    // -----------------------------------------------------------------------
    case 'GET /api/webhook-events': {
      return sendJson(req, res, 200, {
        total: receivedWebhookEvents.length,
        events: receivedWebhookEvents
      });
    }

    // -----------------------------------------------------------------------
    case 'POST /api/register-webhook': {
      let params;
      try {
        params = await readJsonBody(req);
      } catch (err) {
        return sendJson(req, res, err.statusCode || 400, { error: err.message });
      }

      const webhookUrl = params.url;
      if (!webhookUrl) {
        return sendJson(req, res, 400, {
          error:
            'Webhook URL is required (e.g. https://your-tunnel.example/api/paymongo-webhook?secret=...)'
        });
      }
      // Registering a webhook redirects merchant events; only allow explicit https.
      let parsed;
      try {
        parsed = new URL(webhookUrl);
      } catch (err) {
        return sendJson(req, res, 400, { error: 'Webhook URL is not a valid URL' });
      }
      if (parsed.protocol !== 'https:') {
        return sendJson(req, res, 400, { error: 'Webhook URL must use HTTPS' });
      }

      const payload = {
        data: {
          attributes: {
            url: webhookUrl,
            events: params.events || [
              'checkout_session.payment.paid',
              'payment.paid',
              'payment.failed',
              'qrph.expired'
            ]
          }
        }
      };

      return payMongoPost('/v1/webhooks', payload, (err, status, json) => {
        if (err) return sendJson(req, res, 500, { error: err.message });
        sendJson(req, res, status, json);
      });
    }
  }

  return sendJson(req, res, 404, { error: 'Unknown API endpoint' });
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

function serveStatic(req, res, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('400 Bad Request');
  }

  const relative = decodedPath === '/' ? 'tenant-portal.html' : decodedPath.replace(/^\/+/, '');
  const root = path.resolve(__dirname);
  const resolved = path.resolve(root, relative);

  // Traversal guard. Compare with a trailing separator so a sibling directory
  // sharing a name prefix (e.g. "app-secret") cannot pass the check.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  const segments = resolved.split(path.sep).slice(root.split(path.sep).length);
  if (segments.some((s) => BLOCKED_PATH_SEGMENTS.has(s))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  const ext = path.extname(resolved).toLowerCase();
  const baseName = path.basename(resolved);
  if (BLOCKED_FILENAMES.has(baseName) || !MIME_TYPES[ext]) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }

  // Only the site's own pages and assets are published. Server sources, config
  // files, and anything under functions/ are treated as non-existent rather
  // than leaking from the repo root.
  //
  // Every image lives under assets/, so `isAsset` already covers them; the
  // allowance for loose images in the repo root was removed with them.
  const isPage = ext === '.html' && segments.length === 1;
  const isAsset = segments[0] === 'assets';
  const isDoc = segments[0] === 'docs';
  const isServiceWorker = segments.length === 1 && baseName === 'firebase-messaging-sw.js';

  if (!isPage && !isAsset && !isDoc && !isServiceWorker) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('404 Not Found');
  }

  fs.readFile(resolved, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('500 Internal Server Error');
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext],
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(content);
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  if (req.method === 'OPTIONS') {
    const headers = corsHeaders(req);
    if (!resolveCorsOrigin(req)) {
      // Preflight from an unknown origin gets a bare 204 with no CORS grant,
      // so the browser blocks the actual request.
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(204, headers);
    return res.end();
  }

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname, parsedUrl.query).catch((err) => {
      console.error('[api] unhandled error:', err);
      if (!res.headersSent) {
        sendJson(req, res, err.statusCode || 500, { error: err.message });
      } else {
        res.end();
      }
    });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n======================================================');
  console.log('  HomeSpot PayMongo server listening on http://localhost:' + PORT);
  console.log('  Auth          : ' + (REQUIRE_AUTH ? 'Firebase ID token (REQUIRED)' : 'DISABLED'));
  console.log('  QR auto-charge: ' + (ALLOW_TEST_AUTO_CHARGE ? 'ENABLED (test only)' : 'disabled'));
  console.log('  CORS origins  : ' + [...ALLOWED_ORIGINS].join(', '));
  console.log('======================================================\n');
});
