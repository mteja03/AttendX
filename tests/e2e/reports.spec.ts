import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Reports', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.reports);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Headcount', { timeout: 20_000, state: 'visible' });
  });

  test('not on login page', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Continue with Google');
  });

  test('all report tabs are present', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Headcount/);
    expect(body).toMatch(/Leave/);
    expect(body).toMatch(/Assets/);
    expect(body).toMatch(/Compensation/);
  });

  test('Headcount tab shows content', async ({ page }) => {
    await page.getByRole('button', { name: /Headcount/i }).first().click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Headcount|Total|Employee|Department/i);
  });

  test('switching to Leave tab does not crash', async ({ page }) => {
    await page.locator('button', { hasText: 'Leave' }).first().click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
    expect(body).toMatch(/Leave/);
  });

  test('switching to Assets tab does not crash', async ({ page }) => {
    await page.locator('button', { hasText: 'Assets' }).first().click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('switching to Compensation tab does not crash', async ({ page }) => {
    await page.getByRole('button', { name: /Compensation/i }).first().click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
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
