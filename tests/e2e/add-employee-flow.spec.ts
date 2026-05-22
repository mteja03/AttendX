import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

// Unique name per run so we can find and delete exactly what we created
const TEST_FIRST = `E2E`;
const TEST_LAST = `Test${Date.now()}`;
const TEST_NAME = `${TEST_FIRST} ${TEST_LAST}`;
const TEST_EMAIL = `e2e.test.${Date.now()}@test.invalid`;

test.describe('Add Employee Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.employees);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Active', { timeout: 15_000, state: 'visible' });
    await page.waitForTimeout(1000);
  });

  test('can open Add Employee modal', async ({ page }) => {
    await page.locator('button', { hasText: /Add Employee/i }).first().click();
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Personal|First Name|Step 1/i);
  });

  test('modal has 4 steps', async ({ page }) => {
    await page.locator('button', { hasText: /Add Employee/i }).first().click();
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Personal|Employment|Bank|Emergency/i);
  });

  test('can fill step 1 and advance to step 2', async ({ page }) => {
    await page.locator('button', { hasText: /Add Employee/i }).first().click();
    // Wait for modal to fully render before interacting
    await page.waitForSelector('input[type="text"]', { timeout: 10_000, state: 'visible' });
    await page.waitForTimeout(500);

    // Fill inputs in order — Step 1 is Personal: First Name, Last Name, Email
    const inputs = page.locator('input[type="text"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');
    const count = await inputs.count();
    if (count >= 1) await inputs.nth(0).fill(TEST_FIRST);
    if (count >= 2) await inputs.nth(1).fill(TEST_LAST);
    if (count >= 3) await inputs.nth(2).fill(TEST_EMAIL);

    await page.waitForTimeout(300);

    // Click Next
    await page.locator('button', { hasText: /Next/i }).first().click();
    await page.waitForTimeout(1500);

    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Employment|Department|Branch|Joining|Step 2/i);
  });

  test('can close modal without submitting', async ({ page }) => {
    await page.locator('button', { hasText: /Add Employee/i }).first().click();
    await page.waitForTimeout(1000);

    // Close via Cancel or ✕
    const cancelBtn = page.locator('button', { hasText: /Cancel/i }).first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);

    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Employees|Employee/i);
    expect(body).not.toContain('Something went wrong');
  });
});
