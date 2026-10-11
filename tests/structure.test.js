/**
 * Structural checks over the HTML pages.
 *
 * These are cheap, catch the class of breakage that refactoring introduces
 * (unbalanced markup, dangling script/style references, dead tab panes), and
 * give an immediate signal when a page's structure changes unexpectedly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every page that ships. `admin-edit-listing.html` was deleted as dead. */
const PAGES = [
  'index.html',
  'property-detail.html',
  'building.html',
  'start.html',
  'admin-login.html',
  'admin-dashboard.html',
  'super-admin-dashboard.html',
  'tenant-login.html',
  'tenant-portal.html'
];

function read(page) {
  return readFileSync(join(ROOT, page), 'utf8');
}

/** Every browser JS source under assets/js, recursively. */
function jsSources(dir = join(ROOT, 'assets', 'js')) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...jsSources(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(relative(ROOT, full));
    }
  }
  return out;
}

/** Counts opening/closing tags for a container element. */
function tagBalance(html, tag) {
  const open = (html.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
  const close = (html.match(new RegExp(`</${tag}>`, 'g')) || []).length;
  return { open, close };
}

for (const page of PAGES) {
  test(`${page} exists and is non-empty`, () => {
    const html = read(page);
    assert.ok(html.length > 0, `${page} is empty`);
  });

  test(`${page} has balanced <div> tags`, () => {
    const { open, close } = tagBalance(read(page), 'div');
    assert.equal(open, close, `<div> imbalance in ${page}: ${open} open vs ${close} close`);
  });

  test(`${page} has balanced <script> tags`, () => {
    const { open, close } = tagBalance(read(page), 'script');
    assert.equal(open, close, `<script> imbalance in ${page}`);
  });

  test(`${page} references only files that exist`, () => {
    const html = read(page);
    const refs = [
      ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1]),
      // <img src> matters too: a moved or renamed photo is otherwise an
      // invisible 404, since the markup still parses fine.
      ...[...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])
    ]
      // Ignore absolute URLs and the Tailwind CDN.
      .filter((href) => href.startsWith('./') || href.startsWith('../') || !href.includes('://'))
      .filter((href) => !href.startsWith('#') && !href.startsWith('data:'))
      .map((href) => href.split('?')[0]);

    for (const ref of refs) {
      const target = resolve(ROOT, ref.replace(/^\.\//, ''));
      assert.ok(existsSync(target), `${page} references missing file: ${ref}`);
    }
  });

  test(`${page} points only at images that live under assets/img/`, () => {
    // Images used to sit loose in the repo root, which is what forced the
    // static server to allow arbitrary root-level images.
    const html = read(page);
    for (const match of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
      const src = match[1];
      if (src.includes('://') || src.startsWith('data:')) continue;
      assert.ok(
        src.startsWith('assets/img/'),
        `${page} references "${src}" -- images belong under assets/img/`
      );
    }
  });
}

test('every image referenced from JS exists under assets/img/', () => {
  // property-detail.js holds the room gallery in a data array, so a renamed
  // photo is just as invisible there as it would be in markup.
  //
  // These paths resolve against the *document*, not the module, because the
  // values are assigned to element.src at runtime. The pages live at the repo
  // root, so resolve from ROOT.
  const offenders = [];
  const pattern = /['"](assets\/img\/[^'"]+)['"]/g;

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.js')) {
        const source = readFileSync(full, 'utf8');
        for (const match of source.matchAll(pattern)) {
          if (!existsSync(resolve(ROOT, match[1]))) {
            offenders.push(`${relative(ROOT, full)} -> ${match[1]}`);
          }
        }
      }
    }
  };
  walk(join(ROOT, 'assets', 'js'));

  assert.deepEqual(offenders, [], `missing images referenced from JS:\n${offenders.join('\n')}`);
});

test('the room gallery declares an image per room', () => {
  const source = readFileSync(join(ROOT, 'assets', 'js', 'property-detail.js'), 'utf8');
  // Accept either quote style -- Prettier normalises to single quotes.
  const panoramas = [...source.matchAll(/panorama:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

  assert.ok(panoramas.length > 0, 'expected at least one panorama entry');
  for (const p of panoramas) {
    assert.ok(
      existsSync(resolve(ROOT, p)),
      `panorama file missing: ${p} (the Three.js viewer will render nothing)`
    );
  }
});

test('the service worker icon actually exists', () => {
  // firebase-messaging-sw.js pointed at /assets/img/logo.png before that file
  // existed; notification icons silently 404'd.
  const sw = readFileSync(join(ROOT, 'firebase-messaging-sw.js'), 'utf8');
  const icons = [...sw.matchAll(/icon:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

  for (const icon of icons) {
    if (icon.includes('://')) continue;
    assert.ok(existsSync(join(ROOT, icon)), `service worker icon missing: ${icon}`);
  }
});

test('every tab pane has a matching tab button', () => {
  // A pane with no button is unreachable -- `setupTabs()` can never open it.
  const offenders = [];

  for (const page of PAGES) {
    const html = read(page);
    const buttons = new Set([...html.matchAll(/data-tab-button="([^"]+)"/g)].map((m) => m[1]));
    const panes = [...html.matchAll(/data-tab-content="([^"]+)"/g)].map((m) => m[1]);

    for (const pane of panes) {
      if (!buttons.has(pane)) offenders.push(`${page}: tab pane "${pane}" has no button`);
    }
  }

  assert.deepEqual(offenders, [], `orphaned tab panes:\n${offenders.join('\n')}`);
});

test('no HTML page ships unresolved git merge-conflict markers', () => {
  const offenders = [];
  for (const page of PAGES) {
    const html = read(page);
    if (/^<<<<<<< /m.test(html) || /^>>>>>>> /m.test(html)) {
      offenders.push(page);
    }
  }
  assert.deepEqual(offenders, []);
});

test('no page ships an inline <script> block', () => {
  // Everything lives in assets/js/ as modules. An inline block is either a
  // duplicate of the Firebase config or an unbound copy of module scope.
  const offenders = [];

  for (const page of PAGES) {
    if (/<script(?![^>]*\bsrc=)/.test(read(page))) offenders.push(page);
  }

  assert.deepEqual(offenders, [], `pages with inline scripts: ${offenders.join(', ')}`);
});

test('the Firebase web config is declared in exactly one place', () => {
  // It used to be copy-pasted across six files, one of which had silently
  // diverged on storageBucket.
  const carriers = [];
  const pattern = /apiKey:\s*["']AIza/;

  for (const page of PAGES) {
    if (pattern.test(read(page))) carriers.push(page);
  }

  const configFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (
        entry.name.endsWith('.js') &&
        // `*.local.js` is the optional local-project override, gitignored and
        // absent from a normal checkout, so it must not count as a second
        // source of truth.
        !entry.name.endsWith('.local.js') &&
        pattern.test(readFileSync(full, 'utf8'))
      ) {
        configFiles.push(relative(ROOT, full));
      }
    }
  };
  walk(join(ROOT, 'assets', 'js'));

  const total = [...carriers, ...configFiles];
  assert.equal(
    total.length,
    1,
    `expected exactly 1 Firebase config, found ${total.length}: ${total.join(', ')}`
  );
});

test('the deleted dead-scaffolding files are really gone', () => {
  for (const path of ['dataconnect', 'src', 'admin-edit-listing.html', 'assets/js/firebase.js']) {
    assert.equal(existsSync(join(ROOT, path)), false, `${path} should have been deleted`);
  }
});

test('every relative ES module import resolves to a real file', () => {
  // A broken import is a silent 404 in the browser and only shows up as an
  // unhandled rejection at runtime.
  const jsDir = join(ROOT, 'assets', 'js');
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(jsDir);

  const broken = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = resolve(dirname(file), match[1]);
      if (!existsSync(target)) {
        broken.push(`${relative(ROOT, file)} -> ${match[1]}`);
      }
    }
  }

  assert.deepEqual(broken, [], `unresolvable imports:\n${broken.join('\n')}`);
});

test('every page that uses a module also loads firebase-service.js first', () => {
  // Modules execute in document order. A page whose own module reads the
  // firebase-service globals before that file has run will see undefined.
  const offenders = [];

  for (const page of PAGES) {
    const html = read(page);
    const serviceAt = html.indexOf('./assets/js/firebase-service.js');
    if (serviceAt === -1) continue;

    const firstModule = html.search(
      /<script[^>]*type="module"[^>]*src="\.\/assets\/js\/(?!firebase-service)/
    );
    if (firstModule === -1) continue;

    if (firstModule < serviceAt) {
      offenders.push(`${page}: a page module is declared before firebase-service.js`);
    }
  }

  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('no inline event handler interpolates a dynamic value', () => {
  // HTML attribute values are decoded before the JS parser runs, so
  // `onclick="f('${escapeHtml(x)}')"` is still injectable: the escaped
  // apostrophe decodes back to a real quote and terminates the string.
  // Values must travel via data-* attributes and event delegation instead.
  const offenders = [];

  for (const page of PAGES) {
    const html = read(page);
    for (const match of html.matchAll(/\son[a-z]+\s*=\s*"([^"]*)"/g)) {
      if (/\$\{|\+/.test(match[1])) {
        const line = html.slice(0, match.index).split('\n').length;
        offenders.push(`${page}:${line}  ${match[0].trim().slice(0, 70)}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Inline handlers interpolating dynamic values:\n${offenders.join('\n')}`
  );
});

test('JS never builds an inline event handler with a dynamic value', () => {
  // The page scan above only sees handlers that ship as literal markup. It is
  // blind to handlers emitted from JS template literals, which is how the
  // receipt button used to carry an entire payment record into an inline
  // `onclick` -- user-controlled data inside an executable context.
  // Payment records, Firestore values, and profile fields must ride on data-*
  // attributes and be handled by a delegated listener.
  const offenders = [];

  for (const rel of jsSources()) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    // on<event>= ... through to the closing quote/brace, flagging `${` or `+`
    // concatenation anywhere in the handler body.
    for (const match of src.matchAll(/\son[a-z]+\s*=\s*(['"`])((?:[^\\]|\\.)*?)\1/g)) {
      if (/\$\{|\+/.test(match[2])) {
        const line = src.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line}  ${match[0].trim().slice(0, 70)}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Inline handlers built from dynamic values in JS:\n${offenders.join('\n')}\n\n` +
      'Use a data-* attribute plus a delegated click listener instead.'
  );
});

test('the client role guard matches the firestore.rules role hierarchy', () => {
  // firestore.rules: isAdmin() -> ['admin','superadmin'], isSuperAdmin() ->
  // 'superadmin'. The page guard used `role !== requiredRole`, which was an
  // exact match and so bounced a superadmin off admin-dashboard.html even
  // though the rules grant them full admin access there.
  const service = readFileSync(join(ROOT, 'assets/js/firebase-service.js'), 'utf8');

  assert.ok(
    !/if \(role !== requiredRole\)/.test(service),
    'requireRole must not use an exact role comparison'
  );
  assert.match(
    service,
    /if \(requiredRole === 'admin'\) return role === 'admin' \|\| role === 'superadmin';/,
    'an admin requirement must also be satisfied by a superadmin'
  );
  assert.match(
    service,
    /if \(requiredRole === 'superadmin'\) return role === 'superadmin';/,
    'a superadmin requirement must NOT be satisfied by a plain admin'
  );

  // The tenant portal depends on the guard NOT admitting staff.
  const portal = readFileSync(join(ROOT, 'assets/js/pages/tenant-portal.js'), 'utf8');
  assert.match(portal, /role: 'tenant'/, 'tenant-portal must guard on the tenant role');
});

test('the portal never marks a payment paid from the redirect alone', () => {
  // Regression guard for the forgeable-balance bug: the PayMongo return URL is
  // attacker-controlled, so no return path may build a record with
  // `status: 'Paid'`. Payment state must come from the webhook instead.
  const portal = readFileSync(join(ROOT, 'assets/js/pages/tenant-portal.js'), 'utf8');

  const offenders = [];
  portal.split('\n').forEach((line, i) => {
    if (/status:\s*'Paid'/.test(line)) offenders.push(`tenant-portal.js:${i + 1}`);
  });

  assert.deepEqual(
    offenders,
    [],
    `These lines claim a payment is Paid from the client:\n${offenders.join('\n')}\n\n` +
      'Use status: Pending and let lib/payment-verification.js corroborate it.'
  );
});

test('the portal derives its balance from the server, not localStorage', () => {
  const portal = readFileSync(join(ROOT, 'assets/js/pages/tenant-portal.js'), 'utf8');

  // The local due must never seed the displayed balance.
  assert.ok(
    !/localStorage\.getItem\('tenant_amount_due_'\s*\+/.test(portal),
    'the balance must not be seeded from the localStorage cache'
  );
  assert.match(portal, /resolveAmountDue\(/, 'the balance must be derived via resolveAmountDue()');
  assert.match(
    portal,
    /where\('tenantEmail',\s*'==',\s*userEmail\)/,
    'the portal must subscribe to its own payments from the webhook-written collection'
  );
});

test('the webhook is the only thing that reconciles tenant balances', () => {
  // The portal derives what is owed from server data. That only works because
  // something server-side keeps `tenants.amountDue` current once a payment
  // settles -- otherwise a stored balance would forever shadow new payments.
  const fn = readFileSync(join(ROOT, 'functions/index.js'), 'utf8');
  assert.match(
    fn,
    /reconcileTenantBalance/,
    'the webhook must reconcile the tenant balance after recording a payment'
  );
  assert.match(
    fn,
    /computeAmountDue/,
    'the webhook must recompute the balance from the ledger (idempotent), not blind-decrement'
  );
});

test('only the webhook writes tenants.amountDue', () => {
  // Guard against a client write creeping back in. firestore.rules already
  // denies it; this makes the intent explicit in the source too.
  const portal = readFileSync(join(ROOT, 'assets/js/pages/tenant-portal.js'), 'utf8');
  assert.ok(
    !/amountDue:\s*currentRemainingDue/.test(portal),
    'the tenant portal must not write amountDue'
  );

  // staff may write tenants (they create the profile with monthlyRent etc.),
  // but amountDue for a live balance is the webhook's job. Verify the portal
  // has no updateDoc against the tenant doc at all.
  assert.ok(
    !/updateDoc\(tenantDocRef/.test(portal),
    'the tenant portal must not attempt to update its tenant document'
  );
});

test('reservation approval is a single atomic transaction', () => {
  // Approving used to updateDoc the request and THEN decrement availability in a
  // second call. That pair was not atomic, so a double-click or two admin tabs
  // could decrement twice, and nothing stopped approving into a full room.
  const res = readFileSync(join(ROOT, 'assets/js/render/reservations.js'), 'utf8');

  assert.match(
    res,
    /firebaseFirestore\.runTransaction\(/,
    'approveReservation must run inside a Firestore transaction'
  );
  assert.match(res, /canApprove\(/, 'approveReservation must capacity-check via canApprove()');
  assert.match(
    res,
    /nextAvailability\(/,
    'approveReservation must use nextAvailability() to compute the new count'
  );

  // The old non-atomic path must not creep back in.
  assert.ok(
    !/decrementRoomAvailability/.test(res),
    'reservations.js must not import decrementRoomAvailability; the transaction owns the decrement'
  );
  assert.ok(
    !/getReservationsRef\(\)[\s\S]*?updateDoc[\s\S]*?decrement/.test(res),
    'reservations.js must not update-then-decrement outside a transaction'
  );
});

test('the Firestore bridge exposes runTransaction', () => {
  // The approval transaction depends on this being reachable through the
  // single bridge in firebase-service.js.
  const service = readFileSync(join(ROOT, 'assets/js/firebase-service.js'), 'utf8');
  assert.match(
    service,
    /runTransaction,/,
    'firebase-service.js must expose runTransaction on the firebaseFirestore bridge'
  );
});

test('the reservation form checks availability before submitting', () => {
  // Advisory client-side guard that stops queueing an obviously-impossible
  // request. The real guarantee is the approval transaction; this is UX.
  const forms = readFileSync(join(ROOT, 'assets/js/pages/public-forms.js'), 'utf8');
  assert.match(
    forms,
    /readRoomAvailability\(/,
    'the public reservation form must read availability before writing a request'
  );
  assert.match(forms, /fully booked/i, 'the reservation form must show a "fully booked" message');
});

test('the reservations query must keep Approved requests reachable', () => {
  // Regression guard for a dead-end in the booking flow. The dashboard
  // subscribed with where('status','==','Pending'), so an approved request
  // vanished the instant it was approved -- taking the "Create Tenant Account"
  // button (which only renders for Approved) with it. Approving therefore ended
  // the flow: there was no way to onboard the tenant from the request.
  //
  // The 'Create Tenant' button is rendered for status === 'Approved', so the
  // query MUST include 'Approved' or that branch is unreachable.
  const res = readFileSync(join(ROOT, 'assets/js/render/reservations.js'), 'utf8');

  // The 'Create Tenant' button is rendered for status === 'Approved', so the
  // query MUST include 'Approved' or that branch is unreachable.
  assert.ok(
    /where\('status',\s*'in',\s*\[[^\]]*'Approved'/.test(res),
    "the reservations query must include 'Approved' " +
      'so approved requests stay visible for onboarding'
  );

  // Declined/Converted may be fetched for the activity feed, but must never be
  // drawn as actionable rows.
  const rendered = res.slice(
    res.indexOf('renderReservationRequests'),
    res.indexOf('export async function approveReservation')
  );
  assert.ok(
    !/status === 'Declined'/.test(rendered),
    'Declined requests must not be rendered as actionable rows'
  );
  assert.ok(
    !/status === 'Converted'/.test(rendered),
    'Converted requests must not be rendered as actionable rows'
  );
});

test('creating a tenant from a request marks it Converted', () => {
  // Without this link one approval can spawn two tenants, and the dashboard
  // cannot tell which requests have been onboarded.
  const create = readFileSync(
    join(ROOT, 'assets/js/pages/admin-dashboard/create-tenant.js'),
    'utf8'
  );

  assert.match(
    create,
    /sourceReservationId/,
    'create-tenant.js must remember which reservation it is converting'
  );
  assert.match(
    create,
    /status:\s*'Converted'/,
    'creating the tenant must mark the reservation Converted'
  );
  assert.match(create, /tenantUid:\s*uid/, 'the reservation must record which tenant it produced');
});

test('the reservation prefill carries the reservation id', () => {
  const res = readFileSync(join(ROOT, 'assets/js/render/reservations.js'), 'utf8');
  assert.match(
    res,
    /reservationId:\s*doc\.id/,
    'the create-tenant prefill must include reservationId so the request can be linked'
  );
});

test('the admin Listings tab is backed by live rooms, not mock markup', () => {
  // The tab used to render invented listings ("Single Occupancy Room 2/4
  // ₱5,500/mo") with inert Edit/View buttons, for a system that actually has
  // two rooms. It is now a Firestore-backed availability table.
  const page = read('admin-dashboard.html');

  assert.match(page, /id="roomsTableBody"/, 'the Listings tab must render into a live container');
  assert.ok(
    !/Single Occupancy Room/.test(page),
    'the mock "Single Occupancy Room" listing must be gone'
  );
  assert.ok(!/Add New Listing/.test(page), 'the inert "Add New Listing" button must be gone');

  // The overview figures were hardcoded fiction (4 listings, 12 bookings, 5
  // pending, 3 unread) and are now filled from Firestore.
  assert.match(page, /id="statTotalListings"/);
  assert.match(page, /id="statActiveBookings"/);
  assert.ok(
    !/text-3xl font-bold">4</.test(page),
    'the hardcoded "Total Listings: 4" placeholder must be gone'
  );
  assert.ok(
    !/text-3xl font-bold">12</.test(page),
    'the hardcoded "Active Bookings: 12" placeholder must be gone'
  );
});

test('the rooms dashboard writes through the single availability implementation', () => {
  // set-room.js, the dashboard stepper, and the approval transaction must not
  // grow a second, divergent write path for `rooms`.
  const rooms = readFileSync(join(ROOT, 'assets/js/pages/admin-dashboard/rooms.js'), 'utf8');

  assert.match(
    rooms,
    /import \{ setRoomAvailability \} from '\.\.\/\.\.\/room-availability\.js'/,
    'rooms.js must reuse setRoomAvailability rather than write to Firestore itself'
  );
  assert.ok(
    !/firebaseFirestore\.setDoc|firebaseFirestore\.updateDoc/.test(rooms),
    'rooms.js must not open a second write path for the rooms collection'
  );
  assert.match(rooms, /clampAvailability\(/, 'rooms.js must clamp counts before writing');
});

test('room controls are delegated, never inline', () => {
  const rooms = readFileSync(join(ROOT, 'assets/js/pages/admin-dashboard/rooms.js'), 'utf8');

  assert.match(rooms, /data-action="room-inc"/, 'the stepper must use data-* attributes');
  assert.ok(!/\sonclick\s*=/.test(rooms), 'rooms.js must not build inline event handlers');

  // And the dashboard must actually bind them.
  const dash = readFileSync(join(ROOT, 'assets/js/pages/admin-dashboard.js'), 'utf8');
  assert.match(dash, /initRoomControls\(\)/, 'the dashboard must wire the room steppers');
  assert.match(dash, /listenToRooms\(\)/, 'the dashboard must subscribe to rooms');
});

test('units are world-readable but never carry occupancy', () => {
  // Privacy invariant. `units` is `allow read: if true` so a visitor can see the
  // floor plan. If a unit document ever stored "available"/"booked"/"occupied",
  // anyone could scrape which apartments in the building are vacant -- a real
  // safety concern for a residence. Occupancy is derived from `tenants` instead.
  const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
  const match = rules.match(/match \/units\/\{unitId\} \{[\s\S]*?\n {4}\}/);
  assert.ok(match, 'firestore.rules must define a match block for units');

  const block = match[0];
  assert.match(block, /allow read: if true;/, 'units must be world-readable for the tour');
  assert.match(block, /allow write: if isAdmin\(\);/, 'only staff may write units');

  // No occupancy field may be written into a unit document anywhere.
  const seed = readFileSync(join(ROOT, 'seed-units.js'), 'utf8');
  for (const field of ['available', 'occupied', 'booked', 'status']) {
    assert.ok(
      !new RegExp(`${field}:\\s*\\{`, 'i').test(seed),
      `seed-units.js must not seed an occupancy field ("${field}") into units`
    );
  }
});

test('the public building page never reads tenant PII', () => {
  // building.html is world-accessible. It may read `units` (a floor plan) but
  // must not query `tenants`/`payments`/`reservations`, which carry names,
  // emails, balances and lease records.
  const page = readFileSync(join(ROOT, 'assets/js/pages/building-page.js'), 'utf8');

  for (const forbidden of ['tenants', 'reservations', 'payments', 'messages']) {
    assert.ok(
      !new RegExp(`collection\\([^)]*'${forbidden}'`).test(page),
      `building-page.js must not read the "${forbidden}" collection`
    );
  }
  assert.match(
    page,
    /showOccupancy:\s*false/,
    'the public viewer must render with occupancy suppressed'
  );
});

test('the building viewer publishes nothing to window', () => {
  // Guarded by the custom homespot/no-global-leak rule, but the viewer is
  // loaded as a module and easy to regress by adding a debug global.
  const viewer = readFileSync(join(ROOT, 'assets/js/lib/building-viewer.js'), 'utf8');
  assert.ok(
    !/window\.[A-Za-z_$][\w$]*\s*=/.test(viewer),
    'building-viewer.js must not assign to window'
  );
  assert.ok(
    /import\s/.test(viewer),
    'the viewer must reach Three.js via the documented loader, not a bare global'
  );
});

test('the local Firebase project override can never be committed', () => {
  // assets/js/firebase-config.local.js lets a developer point the app at their
  // own Firebase project. It must stay gitignored, otherwise a personal
  // project ID (and api key) lands in the repo.
  const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  assert.match(
    gitignore,
    /^assets\/js\/firebase-config\.local\.js$/m,
    'firebase-config.local.js must be listed in .gitignore'
  );

  // And the committed default must still point at the real project.
  const service = readFileSync(join(ROOT, 'assets/js/firebase-service.js'), 'utf8');
  assert.match(
    service,
    /projectId:\s*'capstoneapt-b5681'/,
    'the committed config must still point at capstoneapt-b5681'
  );
  assert.match(
    service,
    /import\('\.\/firebase-config\.local\.js'\)/,
    'firebase-service.js must support the local override'
  );
});

test('firestore.indexes.json declares only real composite indexes', () => {
  // Firestore auto-creates single-field indexes, and declaring one explicitly
  // now fails the deploy outright:
  //   HTTP 400, this index is not necessary, configure using single field index
  //   controls
  // That shipped once as a broken `firebase deploy`. Only a filter + orderBy
  // pair needs a composite; a single-field query does not.
  const json = JSON.parse(readFileSync(join(ROOT, 'firestore.indexes.json'), 'utf8'));
  const indexes = json.indexes || [];

  const single = indexes.filter((ix) => (ix.fields || []).length < 2);
  assert.deepEqual(
    single.map((ix) => `${ix.collectionGroup}: ${ix.fields?.map((f) => f.fieldPath).join(',')}`),
    [],
    'single-field indexes are automatic -- declaring one breaks `firebase deploy`'
  );

  // And it must stay in sync with the queries that actually need one.
  const appJs = jsSources();
  const needsComposite = appJs.filter((rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    // A where(...) and an orderBy(...) inside the same query(...) call.
    return /query\([\s\S]{0,400}?where\([\s\S]{0,400}?orderBy\(|query\([\s\S]{0,400}?orderBy\([\s\S]{0,400}?where\(/.test(
      src
    );
  });

  assert.ok(
    indexes.length > 0,
    'a query filters AND orders, so at least one composite index must be declared'
  );
  assert.equal(
    needsComposite.length > 0,
    indexes.length > 0,
    'declared indexes and the queries that need them have diverged'
  );
});

test('inline event handlers are not growing', () => {
  // A ratchet rather than a hard ban: pages still use onclick for simple static
  // wiring. This fails if the count rises above the recorded baseline, so the
  // delegation refactor can only move it in one direction.
  // Counts every on* attribute (onclick, ontouchend, oninput, onkeypress, ...),
  // not just onclick. The 7 that remain are static navigation (window.location
  // to another page) and carry no dynamic values.
  const BASELINE = 7;
  const total = PAGES.reduce(
    (sum, page) => sum + (read(page).match(/\son[a-z]+\s*=/g) || []).length,
    0
  );

  assert.ok(
    total <= BASELINE,
    `Inline handler count rose to ${total} (baseline ${BASELINE}). ` +
      'Convert them to data-* attributes with event delegation.'
  );
});
