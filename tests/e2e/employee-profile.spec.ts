import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Employee Profile', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.employees);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
  });

  test('clicking employee row navigates to profile page', async ({ page }) => {
    await page.waitForSelector('text=Daniel Robert', { timeout: 15_000, state: 'visible' });
    await page.getByRole('table').getByText('Daniel Robert').first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    expect(page.url()).toContain('/employees/');
  });

  test('employee profile shows name in header', async ({ page }) => {
    await page.waitForSelector('text=Daniel Robert', { timeout: 15_000, state: 'visible' });
    await page.getByRole('table').getByText('Daniel Robert').first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toContain('Daniel Robert');
  });

  test('employee profile shows department or location', async ({ page }) => {
    await page.waitForSelector('text=Daniel Robert', { timeout: 15_000, state: 'visible' });
    await page.getByRole('table').getByText('Daniel Robert').first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Department|Location|Branch|Joining|Employee/i);
  });

  test('employee profile has tabs', async ({ page }) => {
    await page.waitForSelector('text=Daniel Robert', { timeout: 15_000, state: 'visible' });
    await page.getByRole('table').getByText('Daniel Robert').first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Overview|Documents|Leave|Assets|Timeline/i);
  });

  test('no JS errors on profile page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForSelector('text=Daniel Robert', { timeout: 15_000, state: 'visible' });
    await page.getByRole('table').getByText('Daniel Robert').first().click();
    await page.waitForTimeout(4000);
    const critical = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('ChunkLoadError')
    );
    expect(critical).toHaveLength(0);
  });
});
