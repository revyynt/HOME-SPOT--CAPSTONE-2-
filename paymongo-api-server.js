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
              payment_method_types: ['card', 'paymaya', 'grab_pay', 'dob', 'qrph', 'billease'],
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
