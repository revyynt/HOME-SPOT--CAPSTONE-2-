import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));
const pages = [
  'index.html',
  'login.html',
  'property-detail.html',
  'start.html',
  'admin-login.html',
  'admin-dashboard.html',
  'super-admin-dashboard.html',
  'tenant-login.html',
  'tenant-portal.html'
];

function copyStaticAssets() {
  return {
    name: 'copy-homespot-static-assets',
    generateBundle() {
      const imageDirectory = join(root, 'assets', 'img');
      const emitFiles = (directory) => {
        for (const entry of readdirSync(directory)) {
          const sourcePath = join(directory, entry);
          if (statSync(sourcePath).isDirectory()) {
            emitFiles(sourcePath);
          } else {
            const relativePath = sourcePath.slice(imageDirectory.length + 1);
            this.emitFile({
              type: 'asset',
              fileName: `assets/img/${relativePath.split(sep).join('/')}`,
              source: readFileSync(sourcePath)
            });
          }
        }
      };

      emitFiles(imageDirectory);

      for (const file of ['README.md', 'docs/QUICKSTART.md', 'docs/CONVERSION-SUMMARY.md']) {
        this.emitFile({
          type: 'asset',
          fileName: file,
          source: readFileSync(join(root, file))
        });
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), copyStaticAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((page) => [page.replace(/\.html$/, ''), resolve(root, page)])
      )
    }
  },
  server: { port: 5173, strictPort: true }
});
