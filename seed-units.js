/**
 * Seeds the `units` collection for the 3D building view.
 *
 * Creates one document per physical room, e.g. "201" on floor 2. Units hold only
 * physical facts -- number, floor, type. Occupancy is NOT stored here: it is
 * derived from `tenants` at render time, because `units` is world-readable and
 * an "is this room empty" flag would leak the building's vacancy to anyone who
 * opens the app.
 *
 * Requires an admin Firebase ID token, because firestore.rules only permits
 * staff to write `units`. Get one by signing in at admin-login.html and copying
 * it from the browser console:
 *
 *   await firebaseService.getIdToken()
 *
 * then:
 *   set FIREBASE_ID_TOKEN=<token>       (PowerShell)
 *   export FIREBASE_ID_TOKEN=<token>    (bash/macOS)
 *
 * Examples:
 *   node seed-units.js                  -> list existing units
 *   node seed-units.js --floors 3 --per-floor 4
 *   node seed-units.js --dry-run        -> show what would be written
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'capstoneapt-b5681';
const DOCS_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/units`;

const ID_TOKEN = (process.env.FIREBASE_ID_TOKEN || '').trim();
const DRY_RUN = process.argv.includes('--dry-run');

const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ID_TOKEN}`
};

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  const parsed = Number(process.argv[i + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const FLOORS = argValue('--floors', 3);
const PER_FLOOR = argValue('--per-floor', 4);

/**
 * Builds the unit list.
 *
 * Floor numbering starts at 1 and unit numbers are the floor followed by a
 * two-digit position: floor 2, position 3 -> "203".
 */
function buildUnits() {
  const units = [];
  for (let floor = 1; floor <= FLOORS; floor++) {
    for (let slot = 1; slot <= PER_FLOOR; slot++) {
      const number = `${floor}${String(slot).padStart(2, '0')}`;
      units.push({
        id: number,
        number,
        floor,
        type: 'triple-occupancy-room',
        order: slot - 1
      });
    }
  }
  return units;
}

async function listUnits() {
  const res = await fetch(DOCS_URL, { headers: authHeaders });
  if (!res.ok) throw new Error(`Failed to list units: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.documents || [];
}

async function createUnit(unit) {
  const url = `${DOCS_URL}?documentId=${encodeURIComponent(unit.id)}`;
  const body = {
    fields: {
      number: { stringValue: unit.number },
      floor: { integerValue: unit.floor },
      type: { stringValue: unit.type },
      order: { integerValue: unit.order }
    }
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to write unit ${unit.id}: ${res.status} ${text}`);
  }
  return res.json();
}

async function main() {
  if (!ID_TOKEN && !DRY_RUN) {
    console.error('\n[auth] FIREBASE_ID_TOKEN is not set.');
    console.error('[auth] Sign in at admin-login.html, then run:');
    console.error('[auth]   await firebaseService.getIdToken()');
    console.error('[auth] and export it before running this script.\n');
    process.exit(1);
  }

  const units = buildUnits();

  if (process.argv.length <= 2) {
    if (!ID_TOKEN) {
      console.log('\nNo token supplied -- showing the units that WOULD be created:');
      units.forEach((u) => console.log(`  ${u.number}  floor ${u.floor}  ${u.type}`));
      return;
    }
    console.log('\n📐 Existing units in Firestore:');
    console.log('---------------------------------');
    try {
      const docs = await listUnits();
      if (!docs.length) console.log('  (none yet)');
      docs.forEach((doc) => {
        const id = doc.name.split('/').pop();
        const floor = doc.fields?.floor?.integerValue ?? '?';
        console.log(`  ${id}  (floor ${floor})`);
      });
      console.log('---------------------------------');
      console.log(`Run: node seed-units.js --floors ${FLOORS} --per-floor ${PER_FLOOR}\n`);
    } catch (err) {
      console.error('Error:', err.message);
    }
    return;
  }

  console.log(
    `\n${DRY_RUN ? '[dry run] Would create' : 'Creating'} ${units.length} units ` +
      `(${FLOORS} floors x ${PER_FLOOR})...`
  );

  let created = 0;
  for (const unit of units) {
    if (DRY_RUN) {
      console.log(`  ${unit.number}  floor ${unit.floor}  ${unit.type}`);
      created++;
      continue;
    }
    try {
      await createUnit(unit);
      created++;
    } catch (err) {
      console.error(`  ✕ ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ ${created} units ${DRY_RUN ? 'would be ' : ''}ready.`);
  console.log(
    '   Open admin-dashboard.html -> Building tab, or building.html for the public tour.\n'
  );
}

main();
