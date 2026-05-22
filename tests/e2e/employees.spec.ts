import { test, expect, waitForAuth } from './fixtures';
import { URLS, EMPLOYEES } from './config';

test.describe('Employees', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.employees);
    await waitForAuth(page);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
  });

  test('page title is Employees', async ({ page }) => {
    await expect(page.locator('h1').first()).toContainText('Employees', { timeout: 15_000 });
  });

  test('shows employee count in subtitle', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/\d+ total/, { timeout: 15_000 });
  });

  test('all status tabs are present', async ({ page }) => {
    for (const tab of ['All', 'Active', 'Notice Period', 'On Leave', 'Offboarding', 'Inactive']) {
      await expect(
        page.getByRole('button', { name: tab, exact: true }).first()
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test('known employees appear in list', async ({ page }) => {
    await expect(page.getByRole('table').getByText(EMPLOYEES.danielRobert.name).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('table').getByText(EMPLOYEES.sarahJohnson.name).first()).toBeVisible({ timeout: 20_000 });
  });

  test('search by name works', async ({ page }) => {
    const search = page.locator('input').filter({ hasText: '' }).first();
    await page.waitForSelector('input', { timeout: 10_000 });
    const inputs = page.locator('input');
    const count = await inputs.count();
    // Find search input (not in modal)
    for (let i = 0; i < count; i++) {
      const ph = await inputs.nth(i).getAttribute('placeholder') || '';
      if (ph.toLowerCase().includes('search') || ph.toLowerCase().includes('3+')) {
        await inputs.nth(i).fill('Daniel');
        await page.waitForTimeout(700);
        await expect(page.getByRole('table').getByText(EMPLOYEES.danielRobert.name).first()).toBeVisible();
        break;
      }
    }
  });

  test('Add Employee button is present', async ({ page }) => {
    await expect(
      page.locator('button').filter({ hasText: /Add Employee/i }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('employee row click opens profile URL', async ({ page }) => {
    const row = page.getByText(EMPLOYEES.danielRobert.name).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    await page.waitForURL(/\/employees\//, { timeout: 15_000 });
    expect(page.url()).toContain('/employees/');
  });
});
