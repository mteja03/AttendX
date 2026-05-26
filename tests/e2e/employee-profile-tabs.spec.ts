import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Employee Profile Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.employees);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Daniel Robert', { timeout: 15_000, state: 'visible' });
    await page.getByRole('table').getByText('Daniel Robert').first().click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);
  });

  test('profile page loaded with employee name', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toContain('Daniel Robert');
  });

  test('Overview tab shows employment details', async ({ page }) => {
    const overviewTab = page.locator('button', { hasText: /Overview/i }).first();
    if (await overviewTab.isVisible()) await overviewTab.click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Department|Branch|Location|Joining|Employment/i);
  });

  test('Documents tab loads without crash', async ({ page }) => {
    const docsTab = page.locator('button', { hasText: /Documents/i }).first();
    if (await docsTab.isVisible()) {
      await docsTab.click();
      await page.waitForTimeout(2000);
    }
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('Leave tab loads without crash', async ({ page }) => {
    const leaveTab = page.locator('button', { hasText: /Leave/i }).first();
    if (await leaveTab.isVisible()) {
      await leaveTab.click();
      await page.waitForTimeout(2000);
    }
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('Assets tab loads without crash', async ({ page }) => {
    const assetsTab = page.locator('button', { hasText: /Assets/i }).first();
    if (await assetsTab.isVisible()) {
      await assetsTab.click();
      await page.waitForTimeout(2000);
    }
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('Timeline tab loads without crash', async ({ page }) => {
    const timelineTab = page.locator('button', { hasText: /Timeline|Activity|Log/i }).first();
    if (await timelineTab.isVisible()) {
      await timelineTab.click();
      await page.waitForTimeout(2000);
    }
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('no JS errors on profile with tabs', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const tabs = page.locator('button').filter({ hasText: /Documents|Leave|Assets|Timeline/i });
    const count = await tabs.count();
    for (let i = 0; i < Math.min(count, 4); i++) {
      await tabs.nth(i).click().catch(() => {});
      await page.waitForTimeout(800);
    }
    const critical = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('ChunkLoadError')
    );
    expect(critical).toHaveLength(0);
  });
});
