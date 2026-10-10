// firebase-functions v6+ makes the root export the v2 namespace, which breaks
// the v1-style call signatures below. Importing the explicit /v1 subpath works
// with both v1.x and v7.x.
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const https = require("https");

admin.initializeApp();

/**
 * PayMongo secret key. Read strictly from the environment -- there is no
 * hardcoded fallback, so a missing secret fails loudly at cold start instead of
 * shipping a key in source control.
 *
 * Provision with: firebase functions:secrets:set PAYMONGO_SECRET_KEY
 */
function requireEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(
      `[config] ${name} is not set. Add it via firebase functions:secrets:set ${name}`
    );
  }
  return value;
}

const logger = functions.logger;

const PAYMONGO_SECRET_KEY = requireEnv("PAYMONGO_SECRET_KEY");
const PAYMONGO_AUTH = "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64");

const MAX_AMOUNT_CENTAVOS = 20000000; // PHP 200,000

/**
 * Shared secret for inbound webhooks. PayMongo does not sign payloads, so this
 * header/param check is the only available control.
 */
function webhookSecret() {
  return (process.env.WEBHOOK_SECRET || "").trim();
}

function verifyWebhook(req) {
  const secret = webhookSecret();
  if (!secret) return false;
  const provided = req.get("x-webhook-secret") || req.query.secret || "";
  return provided === secret;
}

/** Grants CORS only for allow-listed origins. Sets headers; does not respond. */
function setCorsHeaders(req, res) {
  const origin = req.get("origin");
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (origin && allowed.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
}

/**
 * Verifies the caller's Firebase ID token.
 * Without this, anyone could mint real PayMongo checkout sessions with the
 * merchant's secret key.
 */
async function requireUser(req, res) {
  const header = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    res.status(401).json({ error: "Missing Firebase ID token" });
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(match[1]);
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired Firebase ID token" });
    return null;
  }
}

function toCentavos(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const centavos = Math.round(amount * 100);
  if (centavos > MAX_AMOUNT_CENTAVOS) return null;
  return centavos;
}

/** POSTs to PayMongo and resolves with the parsed JSON body. */
function payMongoPost(apiPath, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: "api.paymongo.com",
        path: apiPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: PAYMONGO_AUTH,
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (e) {
            reject(new Error("Invalid JSON from PayMongo: " + body.slice(0, 200)));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/**
 * Notifies staff when a new inquiry document is created.
 */
exports.notifyAdminNewInquiry = functions.firestore
  .document("inquiries/{docId}")
  .onCreate(async (snapshot) => {
    const inquiry = snapshot.data();
    if (!inquiry) return;

    const tokensSnapshot = await admin.firestore().collection("adminTokens").get();
    const tokens = tokensSnapshot.docs.map((d) => d.data().token).filter(Boolean);
    if (!tokens.length) return;

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: inquiry.name || "New inquiry",
        body: inquiry.message || "New inquiry received",
      },
    });
  });

/**
 * Creates a PayMongo Checkout Session. Requires a signed-in user.
 */
exports.createPayMongoCheckout = functions.https.onRequest(async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const { amount, description, notes, tenantName, tenantEmail, tenantPhone, successUrl, cancelUrl } =
    req.body || {};

  const amountInCentavos = toCentavos(amount);
  if (amountInCentavos === null) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  const purpose = description || "Rent Payment";
  const payload = {
    data: {
      attributes: {
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        description: notes ? `${purpose} (${notes}) - MJP Residences` : `${purpose} - MJP Residences`,
        line_items: [
          {
            currency: "PHP",
            amount: amountInCentavos,
            name: purpose,
            description: notes ? `Notes: ${notes}` : `Payment for ${purpose}`,
            quantity: 1,
          },
        ],
        payment_method_types: ["card", "paymaya", "grab_pay", "qrph"],
        billing: {
          name: tenantName || undefined,
          email: tenantEmail || undefined,
          phone: tenantPhone || undefined,
        },
        metadata: {
          firebaseUid: user.uid,
          tenantEmail: tenantEmail || user.email || "",
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
    },
  };

  try {
    const { status, json } = await payMongoPost("/v1/checkout_sessions", payload);
    return res.status(status).json(json);
  } catch (err) {
    logger.error("PayMongo checkout failed", { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Creates a PayMongo Payment Link. Requires a signed-in user.
 */
exports.createPayMongoLink = functions.https.onRequest(async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const { amount, description, remarks } = req.body || {};
  const amountInCentavos = toCentavos(amount);
  if (amountInCentavos === null) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    const { status, json } = await payMongoPost("/v1/links", {
      data: {
        attributes: {
          amount: amountInCentavos,
          description: description || "Rent Payment",
          remarks: remarks || "HomeSpot MJP Residences",
        },
      },
    });
    return res.status(status).json(json);
  } catch (err) {
    logger.error("PayMongo link failed", { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Receives PayMongo webhooks.
 *
 * Guarded by WEBHOOK_SECRET, and idempotent on the PayMongo event id so a retry
 * cannot double-write a payment record. This is the only writer to the
 * `payments` collection -- firestore.rules denies client writes.
 */
exports.paymongoWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  if (!verifyWebhook(req)) {
    logger.warn("Rejected webhook with missing/invalid secret");
    return res.status(401).json({ error: "Invalid webhook secret" });
  }

  const payload = req.body || {};
  const eventObj = payload.data?.attributes || {};
  const eventType = eventObj.type || "unknown.event";
  const eventResource = eventObj.data?.attributes || {};
  const resourceId = eventObj.data?.id || "res_unknown";
  const eventId = payload.data?.id || "";

  logger.info(`PayMongo webhook ${eventType} (${resourceId})`);

  const isPaid =
    eventType === "payment.paid" || eventType === "checkout_session.payment.paid";
  const isFailed = eventType === "payment.failed";

  if (!isPaid && !isFailed) {
    return res.status(200).json({ received: true, event: eventType });
  }

  const paymentsRef = admin.firestore().collection("payments");

  // Idempotency: PayMongo retries deliveries, so key on the event id.
  if (eventId) {
    const existing = await paymentsRef.where("payMongoEventId", "==", eventId).limit(1).get();
    if (!existing.empty) {
      return res.status(200).json({ received: true, event: eventType, duplicate: true });
    }
  }

  const amountCentavos = eventResource.amount || 0;
  const billing = eventResource.billing || {};
  const failureCode =
    eventResource.failed_code || eventResource.last_payment_error?.failed_code || null;
  const failureMessage =
    eventResource.failed_message ||
    eventResource.last_payment_error?.failed_message ||
    eventResource.last_payment_error?.detail ||
    null;

  const record = {
    payMongoEventId: eventId,
    payMongoResourceId: resourceId,
    eventType,
    referenceNumber: `PM-${resourceId.slice(-6).toUpperCase()}`,
    amount: amountCentavos / 100,
    currency: eventResource.currency || "PHP",
    status: isPaid ? "Paid" : "Failed",
    description: eventResource.description || "",
    tenantEmail: billing.email || "",
    tenantName: billing.name || "",
    failureCode,
    failureReason: failureMessage,
    dateFormatted: new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    timestamp: new Date().toISOString(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const written = await paymentsRef.add(record);
  logger.info(`Recorded ${record.status} payment ${written.id} for ${record.tenantEmail || "unknown"}`);

  return res.status(200).json({ received: true, event: eventType });
});