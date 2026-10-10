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
