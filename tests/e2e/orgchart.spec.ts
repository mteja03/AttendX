import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('OrgChart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.orgchart);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => !document.body.innerText.trim().startsWith('Loading'),
      { timeout: 20_000 }
    );
    await page.waitForTimeout(1500);
  });

  test('not on login page', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Continue with Google');
  });

  test('org chart page loads', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Org|Chart|Organisation|Organization/i);
  });

  test('employee nodes are visible', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    // The test company has employees — at least one name should appear
    expect(body).toMatch(/Daniel Robert|Sarah Johnson|Employee/i);
  });

  test('no JS errors on page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('ChunkLoadError')
    );
    expect(critical).toHaveLength(0);
  });
});
