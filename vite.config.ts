import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['src/tests/engine/**/*.test.ts', 'src/tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
