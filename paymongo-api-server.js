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

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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

        const payload = {
          data: {
            attributes: {
              send_email_receipt: true,
              show_description: true,
              show_line_items: true,
              description: params.description || 'Rent Payment - MJP Residences',
              line_items: [
                {
                  currency: 'PHP',
                  amount: amountCentavos,
                  name: params.description || 'Rent Payment',
                  quantity: 1
                }
              ],
              payment_method_types: params.payment_method_types || ['card', 'paymaya', 'grab_pay', 'dob', 'qrph', 'billease'],
              billing: {
                name: params.tenantName || undefined,
                email: params.tenantEmail || undefined,
                phone: params.tenantPhone || undefined
              },
              success_url: params.successUrl || `http://localhost:${PORT}/tenant-portal.html?payment=success&amount=${params.amount}&purpose=${encodeURIComponent(params.description || 'Rent')}`,
              cancel_url: params.cancelUrl || `http://localhost:${PORT}/tenant-portal.html?payment=cancelled`
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

  // Static File Serving
  let filePath = path.join(__dirname, pathname === '/' ? 'tenant-portal.html' : pathname);
  const extname = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content, 'utf-8');
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
