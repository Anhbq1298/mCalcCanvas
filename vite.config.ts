import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths: works at / (dev, preview) and at /mCalcCanvas/ (GitHub Pages).
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 4000,
    // Pages: the mCalcCanvas editor, mCompositeBeamDesign (composite/) and mSteelBeamColumn (steel/),
    // which run their worksheets on the same engine.
    rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), composite: fileURLToPath(new URL('./composite/index.html', import.meta.url)), steel: fileURLToPath(new URL('./steel/index.html', import.meta.url)) } },
  },
  test: {
    include: ['src/tests/engine/**/*.test.ts', 'src/tests/unit/**/*.test.ts'],
    environment: 'node',
    // Tests calculate synchronously in-process.
    alias: [{ find: /^\.\/engineFallback$/, replacement: fileURLToPath(new URL('./src/store/engineFallback.sync.ts', import.meta.url)) }],
  },
});
