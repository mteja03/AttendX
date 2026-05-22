import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Assets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.assets);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
  });

  test('not on login page', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Continue with Google');
  });

  test('page title is Assets', async ({ page }) => {
    await page.waitForSelector('text=Trackable', { timeout: 15_000, state: 'visible' });
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Assets/);
  });

  test('Trackable and Consumable tabs exist', async ({ page }) => {
    await page.waitForSelector('text=Trackable', { timeout: 15_000, state: 'visible' });
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Trackable/);
    expect(body).toMatch(/Consumable/);
  });

  test('switching to Consumable tab does not crash', async ({ page }) => {
    await page.waitForSelector('text=Consumable', { timeout: 15_000, state: 'visible' });
    await page.getByRole('button', { name: /Consumable/i }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('Add Asset button is present', async ({ page }) => {
    await page.waitForSelector('text=Trackable', { timeout: 15_000, state: 'visible' });
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Add Asset|New Asset|Add/i);
  });

  test('status filters exist', async ({ page }) => {
    await page.waitForSelector('text=Trackable', { timeout: 15_000, state: 'visible' });
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Available|Assigned|All/i);
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
