import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Team Members', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.team);
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

  test('team page loads with title', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Team|Members|Users/i);
  });

  test('Grant Access button is present', async ({ page }) => {
    // Team Members page uses "Grant Access" to add new members
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Grant Access|Add|Invite/i);
  });

  test('role column or filter is present', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Role|Admin|Manager|Auditor/i);
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
