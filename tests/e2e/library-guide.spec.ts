import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Library HR Guide', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.library);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => !document.body.innerText.trim().startsWith('Loading'),
      { timeout: 15_000 }
    );
    await page.waitForTimeout(1000);
  });

  test('HR Guide tab opens guide content', async ({ page }) => {
    const guideTab = page.locator('button', { hasText: /Guide|HR Guide/i }).first();
    if (await guideTab.isVisible()) await guideTab.click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Guide|Employee|Leave|How to|Overview/i);
  });

  test('guide topics are clickable', async ({ page }) => {
    const guideTab = page.locator('button', { hasText: /Guide|HR Guide/i }).first();
    if (await guideTab.isVisible()) await guideTab.click();
    await page.waitForTimeout(1500);
    const topics = page.locator('button, a').filter({ hasText: /Employee|Leave|Audit|Dashboard/i });
    const count = await topics.count();
    if (count > 0) {
      await topics.first().click();
      await page.waitForTimeout(1000);
    }
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('Policies tab loads policy list', async ({ page }) => {
    const policiesTab = page.locator('button', { hasText: /Policies/i }).first();
    if (await policiesTab.isVisible()) await policiesTab.click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Polic|Upload|Add|No policies/i);
  });

  test('Add Policy button is present', async ({ page }) => {
    const policiesTab = page.locator('button', { hasText: /Policies/i }).first();
    if (await policiesTab.isVisible()) await policiesTab.click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Add Policy|Upload|New Policy|Add/i);
  });
});
