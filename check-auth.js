/**
 * Diagnostic: does the current FIREBASE_ID_TOKEN actually carry admin rights?
 *
 * Distinguishes the two failures that look similar from the CLI:
 *   403 PERMISSION_DENIED -> the token is fine, the `users/{uid}` role document
 *                            is missing or wrong (firestore.rules denies it)
 *   401 INVALID_ARGUMENT / "Missing or insufficient" -> the token itself is bad
 *   fetch failed          -> network, nothing to do with auth
 *
 * Usage:
 *   $env:FIREBASE_ID_TOKEN = "<paste>"
 *   node check-auth.js
 *
 * Decodes the token locally (no signature check) to show who it claims to be,
 * then asks Firestore for that user's role document.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'capstoneapt-b5681';
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const TOKEN = (process.env.FIREBASE_ID_TOKEN || '').trim();

if (!TOKEN) {
  console.error('\n[auth] FIREBASE_ID_TOKEN is not set.\n');
  process.exit(1);
}

function decodeClaims(jwt) {
  try {
    const payload = jwt.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const claims = decodeClaims(TOKEN);
  if (!claims) {
    console.error('[x] The token is not a readable JWT. It may be truncated when pasted.');
    process.exit(1);
  }

  const expiresIn = Math.round((claims.exp * 1000 - Date.now()) / 1000);
  console.log('\nToken claims (decoded locally, signature NOT verified):');
  console.log(`  project : ${claims.iss || 'n/a'}`);
  console.log(`  uid     : ${claims.user_id || claims.sub}`);
  console.log(`  email   : ${claims.email}`);
  console.log(
    `  expiry  : ${expiresIn > 0 ? `valid for ${Math.round(expiresIn / 60)} min` : 'EXPIRED'}`
  );

  if (expiresIn <= 0) {
    console.log('\n[result] EXPIRED -- get a fresh one:');
    console.log('  copy(await firebaseService.getIdToken())');
    process.exit(1);
  }

  // The decisive test: can Firestore resolve this user's role document?
  const uid = claims.user_id || claims.sub;
  const url = `${DOCS}/users/${encodeURIComponent(uid)}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    if (res.status === 404) {
      console.log(`\n[x] No users/${uid} document exists.`);
      console.log('    firestore.rules denies everything when role() cannot be read,');
      console.log('    so every admin write returns 403.');
      console.log('\n    Fix: create that document with the UID above and');
      console.log('         role = "superadmin".');
      process.exit(1);
    }

    if (!res.ok) {
      console.log(`\n[x] Firestore refused the token: HTTP ${res.status}`);
      console.log(`    ${await res.text()}`);
      console.log('\n    If this is a deleted user, the token is dead. Sign in again.');
      process.exit(1);
    }

    const doc = await res.json();
    const role = doc.fields?.role?.stringValue;
    console.log(`\n[ok] users/${uid}.role = "${role}"`);
    console.log(
      role === 'superadmin' || role === 'admin'
        ? '    Admin rights confirmed -- the CLI should work.'
        : '    NOT a staff role -- writes to rooms/units will be denied.'
    );
  } catch (error) {
    console.log(`\n[x] Network failure reaching Firestore: ${error.message}`);
    console.log('    This is connectivity, not permissions. Try again.');
    process.exit(1);
  }
}

main();
