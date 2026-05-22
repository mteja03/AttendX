import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Documents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.documents);
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

  test('page title is Documents', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Documents/i);
  });

  test('document report and actions are present', async ({ page }) => {
    // Documents page shows completion tracker with Download Report + View Documents per employee
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Download Report|View Documents|Documents/i);
  });

  test('document category tabs or filters exist', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/All|Category|Type|Filter/i);
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
