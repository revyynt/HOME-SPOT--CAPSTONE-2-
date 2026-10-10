/**
 * Secret scanning.
 *
 * A live PayMongo secret key was committed and pushed to every branch in this
 * repo's history. These tests make that class of mistake fail CI instead of
 * being discovered months later.
 *
 * Only REAL key shapes are rejected -- the documented placeholders in
 * .env.example are allowed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['node_modules', '.git', '.firebase', 'coverage']);
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.html',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.css',
  '.gql'
]);

/** Files that legitimately contain key-shaped strings. */
const ALLOWED_FILES = new Set(['.env.example']);

/**
 * PayMongo secret keys. The placeholder value is explicitly excluded so
 * .env.example can document the variable without tripping the scan.
 */
const SECRET_PATTERNS = [
  {
    name: 'PayMongo secret key',
    regex: /sk_(?:live|test)_[A-Za-z0-9]{16,}/g,
    isPlaceholder: (match) => match.includes('REPLACE_ME')
  },
  {
    name: 'PayMongo public key',
    regex: /pk_(?:live|test)_[A-Za-z0-9]{16,}/g,
    isPlaceholder: (match) => match.includes('REPLACE_ME')
  },
  {
    name: 'Google/Firebase service-account private key',
    regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
    isPlaceholder: () => false
  },
  {
    name: 'AWS access key id',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    isPlaceholder: () => false
  }
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') && entry !== '.env.example') {
      // still allow explicit hidden files we care about below
    }
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function collectFindings() {
  const findings = [];
  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file);
    if (ALLOWED_FILES.has(rel)) continue;

    const dot = rel.lastIndexOf('.');
    const ext = dot === -1 ? '' : rel.slice(dot);
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    let contents;
    try {
      contents = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const { name, regex, isPlaceholder } of SECRET_PATTERNS) {
      regex.lastIndex = 0;
      for (const match of contents.matchAll(regex)) {
        if (isPlaceholder(match[0])) continue;
        findings.push(`${rel}: ${name} -> ${match[0].slice(0, 12)}...`);
      }
    }
  }
  return findings;
}

test('no secret keys are committed to the working tree', () => {
  const findings = collectFindings();
  assert.deepEqual(
    findings,
    [],
    `Secret-shaped strings found:\n${findings.join('\n')}\n\n` +
      'If a key was committed by accident, REVOKE it -- deleting the line is not enough.'
  );
});

test('.env.example documents the PayMongo keys without real values', () => {
  const example = readFileSync(join(ROOT, '.env.example'), 'utf8');
  assert.match(example, /PAYMONGO_SECRET_KEY=sk_test_REPLACE_ME/);
  assert.ok(!/sk_(live|test)_[A-Za-z0-9]{16,}/.test(example.replace(/REPLACE_ME/g, '')));
});

test('.env is gitignored and not present in the working tree', () => {
  const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.env$/m, '.env must be listed in .gitignore');
  assert.equal(
    existsSync(join(ROOT, '.env')),
    false,
    '.env exists in the working tree -- it must stay local only'
  );
});

test('the PayMongo secret key is never referenced in client-side code', () => {
  // The browser bundle must not be able to authenticate to PayMongo directly.
  const clientFiles = ['assets/js/paymongo-service.js', 'assets/js/lib/qr.js'];
  for (const rel of clientFiles) {
    const contents = readFileSync(join(ROOT, rel), 'utf8');
    assert.ok(
      !/secretKey|PAYMONGO_SECRET/.test(contents),
      `${rel} must not reference the PayMongo secret key`
    );
  }
});
