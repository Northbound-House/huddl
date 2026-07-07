import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const buildStamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
const buildLabel = `${pkg.version} · ${buildStamp} UTC`;

export default defineConfig({
  define: {
    'import.meta.env.VITE_BUILD_LABEL': JSON.stringify(buildLabel),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
