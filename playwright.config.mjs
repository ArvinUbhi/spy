import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 40_000, workers: 1, retries: 0,
  reporter: [['list'], ['junit', { outputFile: 'reports/browser-junit.xml' }], ['html', { outputFolder: 'reports/browser-html', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4319', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node server/index.mjs --production --port 4319', url: 'http://127.0.0.1:4319/api/health', reuseExistingServer: false },
});
