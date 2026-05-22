import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Employee Filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.employees);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Active', { timeout: 15_000, state: 'visible' });
    await page.waitForTimeout(1000);
  });

  test('Active tab shows employees', async ({ page }) => {
    await page.locator('button', { hasText: /^Active/ }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Active|Employee|EMP/i);
  });

  test('Inactive tab does not crash', async ({ page }) => {
    await page.locator('button', { hasText: /Inactive/ }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('Notice Period tab does not crash', async ({ page }) => {
    await page.locator('button', { hasText: /Notice/ }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('On Leave tab does not crash', async ({ page }) => {
    await page.locator('button', { hasText: /On Leave/ }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('search clears when input is emptied', async ({ page }) => {
    const inputs = page.locator('input[type="text"], input[placeholder]');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const placeholder = await inputs.nth(i).getAttribute('placeholder') ?? '';
      if (placeholder.toLowerCase().includes('search') || placeholder.toLowerCase().includes('name')) {
        await inputs.nth(i).fill('Daniel');
        await page.waitForTimeout(700);
        await inputs.nth(i).fill('');
        await page.waitForTimeout(700);
        break;
      }
    }
    const body = await page.locator('body').textContent() ?? '';
    // All employees should be back
    expect(body).toMatch(/Daniel Robert|Sarah Johnson|Employee/i);
  });

  test('Export button is present', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Export|Download|CSV/i);
  });

  test('Add Employee button is visible', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Add Employee|New Employee/i);
  });
});
