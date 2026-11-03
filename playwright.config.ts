import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests. Uses Playwright's bundled Chromium when installed
 * (`npx playwright install chromium`); set CHROME_PATH to use a system Chrome.
 */
export default defineConfig({
  testDir: './src/tests/integration',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:4173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
