/**
 * Local PayMongo API Bridge & Development Server for HomeSpot
 * Runs on Node.js without requiring external npm packages.
 * 
 * Usage: node paymongo-api-server.js [port]
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || process.argv[2] || 5000;
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || 'sk_test_W88PSSzUqwSr3hobvsUyaZK5';
const PAYMONGO_AUTH = 'Basic ' + Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64');
const receivedWebhookEvents = [];

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Private-Network': 'true'
  });
  res.end(JSON.stringify(data));
}

function handlePayMongoRequest(pathName, payload, callback) {
  const data = JSON.stringify(payload);
  const options = {
    hostname: 'api.paymongo.com',
    path: pathName,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': PAYMONGO_AUTH,
      'Content-Length': Buffer.byteLength(data)
    }
  };

  const req = https.request(options, res => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        callback(null, res.statusCode, json);
      } catch (err) {
        callback(err, res.statusCode, { error: 'Invalid JSON response from PayMongo', raw: body });
      }
    });
  });

  req.on('error', err => callback(err, 500, { error: err.message }));
  req.write(data);
  req.end();
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Private-Network': 'true'
    });
    return res.end();
  }

  // API Endpoint: /api/create-checkout
  if (pathname === '/api/create-checkout' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const params = JSON.parse(body);
        const amountCentavos = Math.round(parseFloat(params.amount) * 100);
        const purpose = params.purpose || params.description || 'Monthly Rent';
        const notes = (params.notes || '').toString().trim();
        const sessionDescription = params.description || (notes ? `${purpose} (${notes}) - MJP Residences` : `${purpose} - MJP Residences`);
        const itemDescription = notes ? `Notes: ${notes}` : `Payment for ${purpose} - MJP Residences`;

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
              payment_method_types: (params.payment_method_types || ['card', 'paymaya', 'grab_pay', 'qrph']).filter(m => m !== 'dob' && m !== 'billease'),
              billing: {
                name: params.tenantName || undefined,
                email: params.tenantEmail || undefined,
                phone: params.tenantPhone || undefined
              },
              metadata: {
                purpose: purpose,
                notes: notes,
                tenantName: params.tenantName || '',
                tenantEmail: params.tenantEmail || ''
              },
              success_url: params.successUrl || `http://localhost:${PORT}/tenant-portal.html?payment=success&amount=${params.amount}&purpose=${encodeURIComponent(purpose)}`,
              cancel_url: params.cancelUrl || `http://localhost:${PORT}/tenant-portal.html?payment=failed&amount=${params.amount}&purpose=${encodeURIComponent(purpose)}`
            }
          }
        };

        handlePayMongoRequest('/v1/checkout_sessions', payload, (err, status, json) => {
          if (err) return sendJson(res, 500, { error: err.message });
          sendJson(res, status, json);
        });
      } catch (err) {
        sendJson(res, 400, { error: 'Invalid JSON payload' });
      }
    });
    return;
  }

  // API Endpoint: /api/checkout-status?id=cs_...
  if (pathname === '/api/checkout-status' && req.method === 'GET') {
    const sessionId = parsedUrl.query.id;
    if (!sessionId) {
      return sendJson(res, 400, { error: 'Session ID is required' });
    }
    const options = {
      hostname: 'api.paymongo.com',
      path: `/v1/checkout_sessions/${sessionId}`,
      method: 'GET',
      headers: {
        'Authorization': PAYMONGO_AUTH
      }
    };
    const pmReq = https.request(options, pmRes => {
      let body = '';
      pmRes.on('data', chunk => body += chunk);
      pmRes.on('end', () => {
        try {
          const json = JSON.parse(body);
          sendJson(res, pmRes.statusCode, json);
        } catch (err) {
          sendJson(res, 500, { error: 'Invalid response from PayMongo' });
        }
      });
    });
    pmReq.on('error', err => sendJson(res, 500, { error: err.message }));
    pmReq.end();
    return;
  }

  // API Endpoint: /api/expire-checkout?id=cs_... (Marks checkout session expired/failed in PayMongo test mode)
  if (pathname === '/api/expire-checkout' && (req.method === 'POST' || req.method === 'GET')) {
    const sessionId = parsedUrl.query.id || parsedUrl.query.sessionId;
    if (!sessionId) {
      return sendJson(res, 400, { error: 'Session ID is required' });
    }
    const options = {
      hostname: 'api.paymongo.com',
      path: `/v1/checkout_sessions/${sessionId}/expire`,
      method: 'POST',
      headers: {
        'Authorization': PAYMONGO_AUTH,
        'Content-Type': 'application/json'
      }
    };
    const pmReq = https.request(options, pmRes => {
      let body = '';
      pmRes.on('data', chunk => body += chunk);
      pmRes.on('end', () => {
        try {
          const json = JSON.parse(body);
          sendJson(res, pmRes.statusCode, json);
        } catch (err) {
          sendJson(res, 500, { error: 'Invalid response from PayMongo' });
        }
      });
    });
    pmReq.on('error', err => sendJson(res, 500, { error: err.message }));
    pmReq.end();
    return;
  }

  // API Endpoint: /api/create-card-intent (Direct Card payment with PayMongo 3DS test redirect)
  if (pathname === '/api/create-card-intent' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const params = JSON.parse(body);
        const amountCentavos = Math.round(parseFloat(params.amount) * 100);
        const purpose = params.purpose || params.description || 'Monthly Rent';
        const cardNumber = (params.cardNumber || '4120000000000007').toString().replace(/\s/g, '');
        const expMonth = parseInt(params.expMonth || '12', 10);
        const expYear = parseInt(params.expYear || '28', 10);
        const cvc = (params.cvc || '123').toString();

        // 1. Create PaymentIntent
        const piRes = await fetch('https://api.paymongo.com/v1/payment_intents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': PAYMONGO_AUTH
          },
          body: JSON.stringify({
            data: {
              attributes: {
                amount: amountCentavos,
                payment_method_allowed: ['card'],
                payment_method_options: { card: { request_three_d_secure: 'any' } },
                currency: 'PHP',
                description: `${purpose} - MJP Residences`,
                metadata: {
                  tenantName: params.tenantName || 'Juan Dela Cruz',
                  tenantEmail: params.tenantEmail || 'tenant@example.com',
                  purpose: purpose
                }
              }
            }
          })
        });
        const piData = await piRes.json();
        const piId = piData.data?.id;
        const clientKey = piData.data?.attributes?.client_key;

        if (!piId) {
          return sendJson(res, 400, { error: 'Failed to create payment intent', details: piData });
        }

        // 2. Create PaymentMethod
        const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + Buffer.from('pk_test_gsoWoMD6Ww41rrbHmYz1Jm8n:').toString('base64')
          },
          body: JSON.stringify({
            data: {
              attributes: {
                type: 'card',
                details: {
                  card_number: cardNumber,
                  exp_month: expMonth,
                  exp_year: expYear,
                  cvc: cvc
                },
                billing: {
                  name: params.tenantName || 'Juan Dela Cruz',
                  email: params.tenantEmail || 'tenant@example.com',
                  phone: params.tenantPhone || '09123456789'
                }
              }
            }
          })
        });
        const pmData = await pmRes.json();
        const pmId = pmData.data?.id;

        if (!pmId) {
          return sendJson(res, 400, { error: 'Failed to create payment method', details: pmData });
        }

        // 3. Attach PaymentMethod to PaymentIntent
        const cleanReturnBase = params.returnUrl ? params.returnUrl.split('?')[0] : `http://localhost:${PORT}/tenant-portal.html`;
        const returnUrl = cleanReturnBase;
        const attachRes = await fetch(`https://api.paymongo.com/v1/payment_intents/${piId}/attach`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': PAYMONGO_AUTH
          },
          body: JSON.stringify({
            data: {
              attributes: {
                payment_method: pmId,
                client_key: clientKey,
                return_url: returnUrl
              }
            }
          })
        });
        const attachData = await attachRes.json();
        const nextActionUrl = attachData.data?.attributes?.next_action?.redirect?.url;
        const status = attachData.data?.attributes?.status;

        sendJson(res, 200, {
          paymentIntentId: piId,
          status: status,
          nextActionUrl: nextActionUrl,
          returnUrl: returnUrl,
          referenceNumber: 'PM-CARD-' + piId.slice(-6).toUpperCase()
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // API Endpoint: /api/payment-intent-status?id=pi_...
  if (pathname === '/api/payment-intent-status' && req.method === 'GET') {
    const piId = parsedUrl.query.id;
    if (!piId) return sendJson(res, 400, { error: 'Payment Intent ID is required' });
    const pmReq = https.request({
      hostname: 'api.paymongo.com',
      path: `/v1/payment_intents/${piId}`,
      method: 'GET',
      headers: { 'Authorization': PAYMONGO_AUTH }
    }, pmRes => {
      let body = '';
      pmRes.on('data', chunk => body += chunk);
      pmRes.on('end', () => {
        try {
          sendJson(res, pmRes.statusCode, JSON.parse(body));
        } catch (e) {
          sendJson(res, 500, { error: 'Invalid response from PayMongo' });
        }
      });
    });
    pmReq.on('error', err => sendJson(res, 500, { error: err.message }));
    pmReq.end();
    return;
  }

  // API Endpoint: /api/complete-qr-payment (Executes live test transaction on PayMongo)
  if (pathname === '/api/complete-qr-payment' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const params = JSON.parse(body);
        const amountCentavos = Math.round(parseFloat(params.amount) * 100);
        const description = params.description || 'Rent Payment (QR Ph)';

        // 1. Create source via PayMongo
        const sourceRes = await fetch('https://api.paymongo.com/v1/sources', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': PAYMONGO_AUTH
          },
          body: JSON.stringify({
            data: {
              attributes: {
                type: 'gcash',
                amount: amountCentavos,
                currency: 'PHP',
                description: description,
                redirect: {
                  success: `http://localhost:${PORT}/tenant-portal.html?payment=success`,
                  failed: `http://localhost:${PORT}/tenant-portal.html?payment=failed`
                }
              }
            }
          })
        });
        const sourceData = await sourceRes.json();
        const sourceId = sourceData.data?.id;

        if (!sourceId) {
          return sendJson(res, 400, { error: 'Failed to initialize payment source', details: sourceData });
        }

        // 2. Charge test source via secure-authentication-api
        await fetch(`https://secure-authentication-api.paymongo.com/sources/${sourceId}/charge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        // 3. Create real test payment in PayMongo
        const payRes = await fetch('https://api.paymongo.com/v1/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': PAYMONGO_AUTH
          },
          body: JSON.stringify({
            data: {
              attributes: {
                amount: amountCentavos,
                currency: 'PHP',
                description: description,
                source: {
                  id: sourceId,
                  type: 'source'
                }
              }
            }
          })
        });
        const payData = await payRes.json();
        const payment = payData.data;

        if (payment && payment.id) {
          sendJson(res, 200, {
            success: true,
            paymentId: payment.id,
            status: payment.attributes?.status || 'paid',
            amount: params.amount,
            referenceNumber: 'PM-QR-' + payment.id.slice(-6).toUpperCase()
          });
        } else {
          sendJson(res, 500, { error: 'Failed to finalize PayMongo payment', details: payData });
        }
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // API Endpoint: /api/create-link
  if (pathname === '/api/create-link' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const params = JSON.parse(body);
        const amountCentavos = Math.round(parseFloat(params.amount) * 100);

        const payload = {
          data: {
            attributes: {
              amount: amountCentavos,
              description: params.description || 'Rent Payment',
              remarks: params.remarks || 'HomeSpot MJP Residences'
            }
          }
        };

        handlePayMongoRequest('/v1/links', payload, (err, status, json) => {
          if (err) return sendJson(res, 500, { error: err.message });
          sendJson(res, status, json);
        });
      } catch (err) {
        sendJson(res, 400, { error: 'Invalid JSON payload' });
      }
    });
    return;
  }

  // API Endpoint: /api/paymongo-webhook or /api/webhook (Receives Webhooks from PayMongo)
  if ((pathname === '/api/paymongo-webhook' || pathname === '/api/webhook') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const eventObj = payload.data?.attributes || {};
        const eventType = eventObj.type || 'unknown.event';
        const eventResource = eventObj.data?.attributes || {};
        const eventId = payload.data?.id || 'evt_' + Date.now();
        const resourceId = eventObj.data?.id || 'res_unknown';

        const amountCentavos = eventResource.amount || 0;
        const amountPhp = (amountCentavos / 100).toFixed(2);
        const failureCode = eventResource.failed_code || eventResource.last_payment_error?.failed_code || null;
        const failureMessage = eventResource.failed_message || eventResource.last_payment_error?.failed_message || eventResource.last_payment_error?.detail || null;
        const description = eventResource.description || '';
        const billing = eventResource.billing || {};

        console.log('\n======================================================');
        console.log(`🔔 [PayMongo Webhook Event Received]`);
        console.log(`  Event Type:   ${eventType}`);
        console.log(`  Event ID:     ${eventId}`);
        console.log(`  Resource ID:  ${resourceId}`);
        console.log(`  Amount:       ₱${amountPhp}`);
        if (billing.name) console.log(`  Tenant:       ${billing.name} (${billing.email || 'no email'})`);

        if (eventType === 'payment.failed') {
          console.log(`🚨 STATUS:       FAILED`);
          console.log(`  Failure Code:   ${failureCode || 'declined'}`);
          console.log(`  Failure Reason: ${failureMessage || 'Payment authorization / 3DS authentication failed'}`);
        } else if (eventType === 'payment.paid' || eventType === 'checkout_session.payment.paid') {
          console.log(`✅ STATUS:       PAID / SUCCESSFUL`);
        }
        console.log('======================================================\n');

        const summary = {
          eventId,
          eventType,
          resourceId,
          status: eventType === 'payment.failed' ? 'Failed' : (eventType.includes('paid') ? 'Paid' : 'Processed'),
          amount: parseFloat(amountPhp),
          currency: eventResource.currency || 'PHP',
          description,
          tenantName: billing.name || 'Tenant',
          tenantEmail: billing.email || '',
          failureCode,
          failureReason: failureMessage,
          receivedAt: new Date().toISOString()
        };

        receivedWebhookEvents.unshift(summary);
        if (receivedWebhookEvents.length > 50) receivedWebhookEvents.pop();

        sendJson(res, 200, {
          success: true,
          message: 'Webhook processed successfully',
          eventType,
          eventId
        });
      } catch (err) {
        console.error('❌ Webhook error:', err.message);
        sendJson(res, 400, { error: 'Invalid Webhook JSON payload', message: err.message });
      }
    });
    return;
  }

  // API Endpoint: /api/webhook-events (View all recent received webhooks)
  if (pathname === '/api/webhook-events' && req.method === 'GET') {
    return sendJson(res, 200, {
      total: receivedWebhookEvents.length,
      events: receivedWebhookEvents
    });
  }

  // API Endpoint: /api/register-webhook (Helper to register ngrok webhook with PayMongo)
  if (pathname === '/api/register-webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const params = JSON.parse(body || '{}');
        const webhookUrl = params.url;
        if (!webhookUrl) {
          return sendJson(res, 400, { error: 'Webhook URL is required (e.g. https://your-ngrok.app/api/paymongo-webhook)' });
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

        handlePayMongoRequest('/v1/webhooks', payload, (err, status, json) => {
          if (err) return sendJson(res, 500, { error: err.message });
          sendJson(res, status, json);
        });
      } catch (err) {
        sendJson(res, 400, { error: 'Invalid JSON payload' });
      }
    });
    return;
  }

  // Static File Serving
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (err) {
    decodedPath = pathname;
  }

  let filePath = path.join(__dirname, decodedPath === '/' ? 'tenant-portal.html' : decodedPath);

  // Security: Prevent directory traversal
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(__dirname))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  const extname = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🏠 HomeSpot MJP Residences - PayMongo Server Running`);
  console.log(`  📍 Local: http://localhost:${PORT}/tenant-portal.html`);
  console.log(`  💳 PayMongo API Bridge: http://localhost:${PORT}/api/create-checkout`);
  console.log(`======================================================\n`);
});
