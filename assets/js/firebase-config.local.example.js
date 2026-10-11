/**
 * Local Firebase project override — TEMPLATE.
 *
 * Copy this file to `assets/js/firebase-config.local.js` and replace the values
 * with your own project's web config. That copy is gitignored.
 *
 *   copy assets\js\firebase-config.local.example.js assets\js\firebase-config.local.js
 *
 * When the local file exists, firebase-service.js uses it instead of the
 * committed config. When it does not, the committed config (capstoneapt-b5681)
 * is used unchanged — so this never has to be committed, and a normal checkout
 * keeps pointing at the real project.
 *
 * Get your values from:
 *   Firebase console -> Project settings -> General -> Your apps -> SDK setup
 *
 * Reminder: a Firebase *web* API key is public by design; what actually
 * protects the data is firestore.rules, which you deploy separately:
 *   firebase deploy --only firestore:rules,firestore:indexes
 */

export default {
  // Web app config from Firebase console -> Project settings -> General.
  apiKey: 'REPLACE_WITH_YOUR_WEB_API_KEY',
  authDomain: 'REPLACE_WITH_YOUR_PROJECT.firebaseapp.com',
  projectId: 'REPLACE_WITH_YOUR_PROJECT',
  storageBucket: 'REPLACE_WITH_YOUR_PROJECT.appspot.com',
  messagingSenderId: 'REPLACE_MESSAGING_SENDER_ID',
  appId: 'REPLACE_WITH_APP_ID'
};
