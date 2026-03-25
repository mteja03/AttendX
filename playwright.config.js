import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  globalSetup: './tests/setup/global-setup.js',
  reporter: [
    ['html', { outputFolder: 'tests/playwright-report' }],
    ['list'],
  ],
  use: {
    baseURL: 'https://attendx-1cccb.web.app',
    storageState: 'tests/setup/auth.json',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
})
