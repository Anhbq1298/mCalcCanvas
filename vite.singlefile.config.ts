import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Builds dist-single/index.html with all JS, CSS, fonts and icons inlined. */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  // The calculation worker is inlined: a single file cannot load a second one offline.
  resolve: { alias: [{ find: /^\.\/engineWorker$/, replacement: fileURLToPath(new URL('./src/store/engineWorkerInline.ts', import.meta.url)) }] },
  base: './',
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 20000,
  },
});
