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
 *   npm run seed-units                      -> preview (no token needed)
 *   npm run seed-units -- 3 4               -> create 3 floors x 4 units
 *   npm run seed-units -- 2                 -> create 2 floors, default 4 per floor
 *   node seed-units.js --floors 3 --per-floor 4 --dry-run   (flags work via node)
 *
 * Positional arguments are the documented form because npm's PowerShell wrapper
 * strips dashed flags passed after `--`:
 *   npm run seed-units -- --floors 3 --dry-run   ->   node seed-units.js 3
 * Running with no token always previews and never writes.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'capstoneapt-b5681';
const DOCS_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/units`;

const ID_TOKEN = (process.env.FIREBASE_ID_TOKEN || '').trim();

const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${ID_TOKEN}`
};

const DEFAULT_FLOORS = 3;
const DEFAULT_PER_FLOOR = 4;

/**
 * Parses the shape arguments.
 *
 * Accepts both `--floors 3 --per-floor 4` and bare `3 4`, because npm strips
 * leading dashes from flags passed after `--` in some versions:
 *
 *   npm run seed-units -- --floors 3 --per-floor 4
 *     -> node seed-units.js 3 4          <-- flags gone
 *
 * Supporting positionals means that mangling is harmless instead of silently
 * falling back to the defaults.
 *
 * @param {string[]} argv
 * @returns {{floors: number, perFloor: number, dryRun: boolean}}
 */
function parseArgs(argv) {
  const positional = [];
  let floors = null;
  let perFloor = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--floors' || arg === '-f') {
      floors = Number(argv[++i]);
      continue;
    }
    if (arg === '--per-floor' || arg === '-p') {
      perFloor = Number(argv[++i]);
      continue;
    }
    if (arg === '--dry-run' || arg === '-n') {
      dryRun = true;
      continue;
    }
    if (/^\d+$/.test(arg)) {
      positional.push(Number(arg));
    }
  }

  // `3 4` positionally, then fall back to flags, then defaults.
  const resolvedFloors =
    positional[0] ?? floors ?? DEFAULT_FLOORS;
  const resolvedPerFloor =
    positional[1] ?? perFloor ?? DEFAULT_PER_FLOOR;

  return {
    floors: Math.max(1, Math.min(50, resolvedFloors)),
    perFloor: Math.max(1, Math.min(20, resolvedPerFloor)),
    dryRun: dryRun || argv.includes('--dry-run')
  };
}

const { floors: FLOORS, perFloor: PER_FLOOR, dryRun: DRY_RUN } = parseArgs(process.argv.slice(2));

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

const UNIT_FIELDS = ['number', 'floor', 'type', 'order'];

async function createUnit(unit) {
  // PATCH the full document path with an update mask, which upserts: it creates
  // the document if it is absent and updates it if it already exists. The
  // previous form used `?documentId=` on the *collection* URL, which is not a
  // valid Firestore parameter:
  //   400 Unknown name "documentId": Cannot bind query parameter
  const updateMask = UNIT_FIELDS.map((f) => `updateMask.fieldPaths=${f}`).join('&');
  const url = `${DOCS_URL}/${encodeURIComponent(unit.id)}?${updateMask}`;

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
  const units = buildUnits();

  // No token => preview and stop. Deliberately not an error exit: npm's
  // PowerShell wrapper strips dashed flags (including --dry-run), so "was
  // --dry-run passed?" is not a reliable signal here. The presence of a token
  // is. Previewing without one keeps the command useful and can never write.
  if (!ID_TOKEN) {
    console.log(`\n[dry run] No FIREBASE_ID_TOKEN -- showing what WOULD be created:`);
    console.log(`          ${units.length} units (${FLOORS} floors x ${PER_FLOOR})\n`);
    units.forEach((u) => console.log(`  ${u.number}  floor ${u.floor}  ${u.type}`));
    console.log('\nTo actually write them:');
    console.error('[auth]   1. Sign in at admin-login.html');
    console.error('[auth]   2. In the browser console:  copy(await firebaseService.getIdToken())');
    console.error('[auth]   3. $env:FIREBASE_ID_TOKEN = "<paste>"   (PowerShell)');
    console.error(`[auth]   4. npm run seed-units -- ${FLOORS} ${PER_FLOOR}\n`);
    return;
  }

  if (process.argv.length <= 2) {
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
      console.log(`Run: npm run seed-units -- ${FLOORS} ${PER_FLOOR}\n`);
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
