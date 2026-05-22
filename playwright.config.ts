import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'https://attendx-1cccb.web.app',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: '**/auth.setup.ts',
      use: {
        headless: false,
        channel: 'chrome',
        launchOptions: {
          args: ['--disable-blink-features=AutomationControlled'],
        },
      },
    },
    {
      name: 'attendx',
      testMatch: '**/*.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
    },
  ],
});
