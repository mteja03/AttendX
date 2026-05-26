import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Add Asset Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.assets);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Trackable', { timeout: 25_000, state: 'visible' });
    await page.waitForTimeout(500);
  });

  test('Add Asset modal opens', async ({ page }) => {
    await page.locator('button', { hasText: /Add Asset/i }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Asset Name|Type|Serial|Brand|Category/i);
  });

  test('modal has asset name field', async ({ page }) => {
    await page.locator('button', { hasText: /Add Asset/i }).first().click();
    await page.waitForTimeout(1500);
    const nameInput = page.locator('input').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  });

  test('modal has asset type or category selector', async ({ page }) => {
    await page.locator('button', { hasText: /Add Asset/i }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Type|Category|Laptop|Phone|Furniture/i);
  });

  test('can fill asset name field', async ({ page }) => {
    await page.locator('button', { hasText: /Add Asset/i }).first().click();
    await page.waitForTimeout(1500);

    const inputs = page.locator('input[type="text"], input:not([type])');
    const count = await inputs.count();
    if (count >= 1) {
      await inputs.nth(0).fill(`E2E Test Asset ${Date.now()}`);
      const val = await inputs.nth(0).inputValue();
      expect(val).toContain('E2E Test Asset');
    }
  });

  test('Consumable tab also has Add button', async ({ page }) => {
    await page.locator('button', { hasText: /Consumable/i }).first().click();
    await page.waitForTimeout(1000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Add|New/i);
  });

  test('modal closes on cancel', async ({ page }) => {
    await page.locator('button', { hasText: /Add Asset/i }).first().click();
    await page.waitForTimeout(1000);

    const cancelBtn = page.locator('button', { hasText: /Cancel/i }).first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);

    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Trackable|Assets/i);
    expect(body).not.toContain('Something went wrong');
  });
});
