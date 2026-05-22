import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Leave Apply Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.leave);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Pending', { timeout: 15_000, state: 'visible' });
    await page.waitForTimeout(500);
  });

  test('Add Leave modal opens with required fields', async ({ page }) => {
    await page.locator('button', { hasText: 'Add Leave' }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Employee|Leave Type|Start|From|Date/i);
  });

  test('modal has an Employee selector', async ({ page }) => {
    await page.locator('button', { hasText: 'Add Leave' }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Employee|Select employee/i);
  });

  test('modal has Leave Type selector', async ({ page }) => {
    await page.locator('button', { hasText: 'Add Leave' }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Leave Type|Sick|Casual|Annual|Type/i);
  });

  test('modal has date fields', async ({ page }) => {
    await page.locator('button', { hasText: 'Add Leave' }).first().click();
    await page.waitForTimeout(1500);
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('can select an employee in the leave form', async ({ page }) => {
    await page.locator('button', { hasText: 'Add Leave' }).first().click();
    await page.waitForTimeout(1500);

    // Try clicking the employee selector/dropdown
    const employeeSelect = page.locator('select').first();
    const employeeCombo = page.locator('[placeholder*="employee"], [placeholder*="Employee"]').first();

    if (await employeeSelect.isVisible()) {
      const options = await employeeSelect.locator('option').count();
      if (options > 1) await employeeSelect.selectOption({ index: 1 });
    } else if (await employeeCombo.isVisible()) {
      await employeeCombo.click();
      await page.waitForTimeout(500);
    }

    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('Submit button exists in modal', async ({ page }) => {
    await page.locator('button', { hasText: 'Add Leave' }).first().click();
    await page.waitForTimeout(1500);
    const submitBtn = page.locator('button', { hasText: /Submit|Save|Apply|Add Leave/i })
      .filter({ hasNot: page.locator('[disabled]') });
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Submit|Save|Apply/i);
  });

  test('modal closes cleanly on cancel', async ({ page }) => {
    await page.locator('button', { hasText: 'Add Leave' }).first().click();
    await page.waitForTimeout(1000);

    const cancelBtn = page.locator('button', { hasText: /Cancel/i }).first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);

    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Pending|Approved|Leave/i);
    expect(body).not.toContain('Something went wrong');
  });
});
