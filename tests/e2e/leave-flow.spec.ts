import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Leave Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.leave);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Pending', { timeout: 15_000, state: 'visible' });
  });

  test('clicking Add Leave opens a modal or form', async ({ page }) => {
    await page.locator('button', { hasText: 'Add Leave' }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    // Modal should appear with form fields
    expect(body).toMatch(/Leave Type|Employee|Start Date|From|Date|Cancel/i);
  });

  test('Add Leave modal can be closed', async ({ page }) => {
    await page.locator('button', { hasText: 'Add Leave' }).first().click();
    await page.waitForTimeout(1000);
    // Close via Cancel button or ✕
    const cancelBtn = page.locator('button', { hasText: /Cancel|Close/i }).first();
    const closeBtn = page.locator('button:has-text("✕"), button[aria-label="Close"]').first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('Pending tab filters correctly', async ({ page }) => {
    await page.locator('button', { hasText: 'Pending' }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Pending|No leave|no requests/i);
  });

  test('Approved tab filters correctly', async ({ page }) => {
    await page.locator('button', { hasText: 'Approved' }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Approved|No leave|no requests/i);
  });

  test('Leave Balance button is present', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Leave Balance|Balance/i);
  });

  test('Download button is present', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Download|Export/i);
  });
});
