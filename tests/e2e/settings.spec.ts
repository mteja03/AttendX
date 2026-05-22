import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.settings);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => !document.body.innerText.trim().startsWith('Loading'),
      { timeout: 15_000 }
    );
    await page.waitForTimeout(1000);
  });

  test('not on login page', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Continue with Google');
  });

  test('settings page loads with company config', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Settings|Company|Configuration/i);
  });

  test('Branches section is present', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Branch|Branches/i);
  });

  test('Departments section is present', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Department|Departments/i);
  });

  test('Leave Types section is present', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Leave Type|Leave/i);
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
