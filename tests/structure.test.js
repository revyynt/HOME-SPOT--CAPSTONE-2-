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
      else if (entry.name.endsWith('.js') && pattern.test(readFileSync(full, 'utf8'))) {
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

  assert.ok(
    /where\('status',\s*'in',\s*\['Pending',\s*'Approved'\]\)/.test(res),
    "the reservations query must use where('status','in',['Pending','Approved']) " +
      'so approved requests stay visible for onboarding'
  );

  // Converted requests must leave the working list.
  assert.ok(
    !/where\('status',\s*'in',\s*\[[^\]]*'Converted'/.test(res),
    'Converted requests should not stay in the actionable list'
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
