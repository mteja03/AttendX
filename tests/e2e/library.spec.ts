import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Library', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.library);
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

  test('library page loads with tabs', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Policies|Roles|Library|Guide/i);
  });

  test('Policies tab is present', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Polic/i);
  });

  test('HR Guide tab is present', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Guide|HR Guide/i);
  });

  test('switching tabs does not crash', async ({ page }) => {
    await page.waitForTimeout(2000);
    const tabs = page.getByRole('button').filter({ hasText: /Policies|Roles|Guide/i });
    const count = await tabs.count();
    if (count > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(1500);
    }
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
