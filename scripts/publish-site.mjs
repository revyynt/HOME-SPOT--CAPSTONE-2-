import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');
const BUCKET = 'homespot-site';
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

async function listFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(filePath)));
    } else {
      files.push(filePath);
    }
  }
  return files;
}

async function publishSite() {
  const envFile = join(ROOT, '.env.publish.local');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const projectUrl = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectUrl || !apiKey) {
    throw new Error(
      'Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.publish.local.'
    );
  }
  if (!existsSync(DIST)) {
    throw new Error('The Vite build is missing. Run npm run build:supabase before publishing.');
  }

  const supabase = createClient(projectUrl, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const files = await listFiles(DIST);

  for (let offset = 0; offset < files.length; offset += 6) {
    const batch = files.slice(offset, offset + 6);
    await Promise.all(
      batch.map(async (filePath) => {
        const objectPath = relative(DIST, filePath).split(sep).join('/');
        const contentType =
          CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(objectPath, await readFile(filePath), {
            contentType,
            cacheControl: '300',
            upsert: true
          });
        if (error)
          throw new Error(`Failed to publish ${objectPath}: ${error.message}`, { cause: error });
      })
    );
  }

  console.log(`Published ${files.length} files to ${BUCKET}.`);
  console.log(`Site URL: ${projectUrl.replace(/\/+$/, '')}/functions/v1/site/`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  await publishSite();
}
