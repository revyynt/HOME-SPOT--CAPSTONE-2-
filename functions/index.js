const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.notifyAdminNewInquiry = functions.firestore
  .document("inquiries/{docId}")
  .onCreate(async (snapshot) => {

    const inquiry = snapshot.data();

    const tokensSnapshot = await admin.firestore()
      .collection("adminTokens")
      .get();

    const tokens = tokensSnapshot.docs.map(doc => doc.data().token);

    if (!tokens.length) return;

    const payload = {
      notification: {
        title: inquiry.name,
        body: inquiry.message || "New inquiry received"
      }
    };

    await admin.messaging().sendToDevice(tokens, payload);
});

// PayMongo Secret Key & Helper
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || "sk_live_aqrKyvmfTu8h6JPQeXt8iUmH";
const PAYMONGO_AUTH = "Basic " + Buffer.from(PAYMONGO_SECRET_KEY + ":").toString("base64");

/**
 * Cloud Function to create PayMongo Checkout Session
 */
exports.createPayMongoCheckout = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { amount, description, tenantName, tenantEmail, tenantPhone, successUrl, cancelUrl } = req.body;
    const amountInCentavos = Math.round(parseFloat(amount) * 100);

    const https = require("https");
    const payload = JSON.stringify({
      data: {
        attributes: {
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          description: description || "Rent Payment - MJP Residences",
          line_items: [
            {
              currency: "PHP",
              amount: amountInCentavos,
              name: description || "Rent Payment",
              quantity: 1
            }
          ],
          payment_method_types: ["card", "paymaya", "grab_pay", "dob", "qrph", "billease"],
          billing: {
            name: tenantName || undefined,
            email: tenantEmail || undefined,
            phone: tenantPhone || undefined
          },
          success_url: successUrl,
          cancel_url: cancelUrl
        }
      }
    });

    const options = {
      hostname: "api.paymongo.com",
      path: "/v1/checkout_sessions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": PAYMONGO_AUTH,
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const apiReq = https.request(options, (apiRes) => {
      let body = "";
      apiRes.on("data", (chunk) => body += chunk);
      apiRes.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
            return res.status(200).json(json);
          } else {
            return res.status(apiRes.statusCode).json(json);
          }
        } catch (e) {
          return res.status(500).json({ error: "Invalid JSON from PayMongo", raw: body });
        }
      });
    });

    apiReq.on("error", (e) => {
      res.status(500).json({ error: e.message });
    });

    apiReq.write(payload);
    apiReq.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Cloud Function to create PayMongo Payment Link
 */
exports.createPayMongoLink = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { amount, description, remarks } = req.body;
    const amountInCentavos = Math.round(parseFloat(amount) * 100);

    const https = require("https");
    const payload = JSON.stringify({
      data: {
        attributes: {
          amount: amountInCentavos,
          description: description || "Rent Payment",
          remarks: remarks || "HomeSpot MJP Residences"
        }
      }
    });

    const options = {
      hostname: "api.paymongo.com",
      path: "/v1/links",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": PAYMONGO_AUTH,
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const apiReq = https.request(options, (apiRes) => {
      let body = "";
      apiRes.on("data", (chunk) => body += chunk);
      apiRes.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (apiRes.statusCode >= 200 && apiRes.statusCode < 300) {
            return res.status(200).json(json);
          } else {
            return res.status(apiRes.statusCode).json(json);
          }
        } catch (e) {
          return res.status(500).json({ error: "Invalid JSON from PayMongo", raw: body });
        }
      });
    });

    apiReq.on("error", (e) => {
      res.status(500).json({ error: e.message });
    });

    apiReq.write(payload);
    apiReq.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});