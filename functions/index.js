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