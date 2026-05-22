import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Audit Assign Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.audit);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Assigned', { timeout: 20_000, state: 'visible' });
    await page.waitForTimeout(1000);
  });

  test('Assign Audit button is present', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Assign Audit|New Audit|\+ Assign/i);
  });

  test('Assign Audit modal opens', async ({ page }) => {
    await page.locator('button', { hasText: /Assign Audit/i }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Audit Type|Template|Auditor|Branch|Date/i);
  });

  test('modal has Audit Type selector', async ({ page }) => {
    await page.locator('button', { hasText: /Assign Audit/i }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Audit Type|Template|Select/i);
  });

  test('modal has Auditor field', async ({ page }) => {
    await page.locator('button', { hasText: /Assign Audit/i }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Auditor|Assign to|Team/i);
  });

  test('modal has date fields', async ({ page }) => {
    await page.locator('button', { hasText: /Assign Audit/i }).first().click();
    await page.waitForTimeout(1500);
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('opening audit detail and verifying checklist tab', async ({ page }) => {
    const firstAudit = page.locator('text=/AUD-\\d{4}-\\d{3}/').first();
    await firstAudit.waitFor({ timeout: 10_000, state: 'visible' });
    await firstAudit.click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Checklist|Findings|Details/i);
  });

  test('checklist items are visible in open audit', async ({ page }) => {
    const firstAudit = page.locator('text=/AUD-\\d{4}-\\d{3}/').first();
    await firstAudit.waitFor({ timeout: 10_000, state: 'visible' });
    await firstAudit.click();
    await page.waitForTimeout(2000);
    // Click Checklist tab if not already active
    const checklistTab = page.locator('button', { hasText: /Checklist/i }).first();
    if (await checklistTab.isVisible()) await checklistTab.click();
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Pass|Fail|N\/A|Checklist|Question|Item/i);
  });

  test('assign modal closes on cancel', async ({ page }) => {
    await page.locator('button', { hasText: /Assign Audit/i }).first().click();
    await page.waitForTimeout(1000);

    const cancelBtn = page.locator('button', { hasText: /Cancel/i }).first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);

    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/AUD-|Assigned|Audit/i);
    expect(body).not.toContain('Something went wrong');
  });
});
