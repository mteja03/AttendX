import { test, expect } from './fixtures';
import { URLS } from './config';

// Smoke test — every page must load without crashing
const PAGES = [
  { name: 'Dashboard', url: URLS.dashboard },
  { name: 'Employees', url: URLS.employees },
  { name: 'Leave',     url: URLS.leave     },
  { name: 'Documents', url: URLS.documents },
  { name: 'Library',   url: URLS.library   },
  { name: 'Assets',    url: URLS.assets    },
  { name: 'Reports',   url: URLS.reports   },
  { name: 'Audit',     url: URLS.audit     },
  { name: 'Calendar',  url: URLS.calendar  },
  { name: 'Org Chart', url: URLS.orgchart  },
  { name: 'Settings',  url: URLS.settings  },
];

for (const { name, url } of PAGES) {
  test(`${name} — loads without crash`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(url);
    await page.waitForLoadState('domcontentloaded');
    // Give Firebase auth + React hydration time to settle
    // networkidle never fires on Firebase apps (persistent WebSocket connections)
    await page.waitForTimeout(4000);

    // Must be authenticated — login page must NOT be showing
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Continue with Google');
    expect(body).not.toContain('Sign in to AttendX');

    // No crash screen
    await expect(page.locator('body')).not.toContainText('Something went wrong');

    // No unhandled JS errors
    expect(errors.filter((e) => !e.includes('ChunkLoad'))).toHaveLength(0);
  });
}
