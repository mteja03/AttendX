import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.calendar);
    await page.waitForLoadState('domcontentloaded');
    // Calendar loads employees + events + leave — wait for loading spinner to clear
    await page.waitForFunction(
      () => !document.body.innerText.trim().startsWith('Loading'),
      { timeout: 20_000 }
    );
    await page.waitForTimeout(1500);
  });

  test('not on login page', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Continue with Google');
  });

  test('calendar renders a month name', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
  });

  test('day-of-week headers are present', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/i);
  });

  test('current year is shown', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/2025|2026|2027/);
  });

  test('Add Event button is present', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Add Event|New Event|Event/i);
  });

  test('view mode toggles are present', async ({ page }) => {
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Month|Week|Agenda/i);
  });

  test('no JS errors on page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('ChunkLoadError')
    );
    expect(critical).toHaveLength(0);
  });
});
