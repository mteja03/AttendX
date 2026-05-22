import { test, expect, waitForAuth } from './fixtures';
import { URLS } from './config';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.dashboard);
    await waitForAuth(page);           // ← fail fast if not authenticated
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);   // Firestore data render buffer
  });

  test('shows Total Employees stat card', async ({ page }) => {
    await expect(page.getByText('Total Employees')).toBeVisible({ timeout: 20_000 });
  });

  test('shows On Leave stat card', async ({ page }) => {
    await expect(page.getByText('On Leave')).toBeVisible({ timeout: 20_000 });
  });

  test('shows New Joiners stat card', async ({ page }) => {
    await expect(page.getByText('New Joiners')).toBeVisible({ timeout: 20_000 });
  });

  test('sidebar nav links are present', async ({ page }) => {
    await expect(page.locator('nav, aside').getByText('Employees').first()).toBeVisible();
    await expect(page.locator('nav, aside').getByText('Leave').first()).toBeVisible();
    await expect(page.locator('nav, aside').getByText('Audit').first()).toBeVisible();
  });
});
