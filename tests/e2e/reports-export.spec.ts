import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Reports Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.reports);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Headcount', { timeout: 20_000, state: 'visible' });
    await page.waitForTimeout(1000);
  });

  test('Headcount tab has export button', async ({ page }) => {
    await page.locator('button', { hasText: 'Headcount' }).first().click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Export|Download|CSV|Excel/i);
  });

  test('Leave tab loads without crash', async ({ page }) => {
    await page.locator('button', { hasText: 'Leave' }).first().click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    // Leave tab may show empty state if no data; either way should not crash
    expect(body).toMatch(/Leave|No leave|Export|Download/i);
    expect(body).not.toContain('Something went wrong');
  });

  test('Assets tab has export button', async ({ page }) => {
    await page.locator('button', { hasText: 'Assets' }).first().click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Export|Download|CSV|Excel/i);
  });

  test('Compensation tab has export button', async ({ page }) => {
    await page.locator('button', { hasText: /Compensation/i }).first().click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Export|Download|CSV|Excel/i);
  });

  test('Headcount shows employee count data', async ({ page }) => {
    await page.locator('button', { hasText: 'Headcount' }).first().click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/\d+/);
    expect(body).toMatch(/Employee|Active|Total|Department/i);
  });

  test('switching all 4 tabs does not crash', async ({ page }) => {
    const tabs = ['Headcount', 'Leave', 'Assets', 'Compensation'];
    for (const tab of tabs) {
      await page.locator('button', { hasText: tab }).first().click();
      await page.waitForTimeout(1500);
    }
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });
});
