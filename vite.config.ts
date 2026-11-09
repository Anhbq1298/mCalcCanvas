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
  },
  test: {
    include: ['src/tests/engine/**/*.test.ts', 'src/tests/unit/**/*.test.ts'],
    environment: 'node',
    // Tests calculate synchronously in-process.
    alias: [{ find: /^\.\/engineFallback$/, replacement: fileURLToPath(new URL('./src/store/engineFallback.sync.ts', import.meta.url)) }],
  },
});
