import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Leave', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.leave);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
  });

  test('not on login page', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Continue with Google');
  });

  test('page title is Leave', async ({ page }) => {
    await page.waitForSelector('text=Pending', { timeout: 15_000, state: 'visible' });
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Leave/);
  });

  test('status filter tabs are present', async ({ page }) => {
    await page.waitForSelector('text=Pending', { timeout: 15_000, state: 'visible' });
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Pending|Approved|Rejected/);
  });

  test('Apply Leave button is present', async ({ page }) => {
    await page.waitForSelector('text=Pending', { timeout: 15_000, state: 'visible' });
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Add Leave|Apply|New Leave|Request/i);
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
