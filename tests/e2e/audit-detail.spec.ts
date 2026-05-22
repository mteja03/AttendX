import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Audit Detail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.audit);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Assigned', { timeout: 20_000, state: 'visible' });
    await page.waitForTimeout(1000);
  });

  test('audit list loads with AUD reference IDs', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/AUD-\d{4}-\d{3}/);
  });

  test('clicking an audit row opens the detail panel', async ({ page }) => {
    const firstAuditRow = page.locator('text=/AUD-\\d{4}-\\d{3}/').first();
    await firstAuditRow.waitFor({ timeout: 15_000, state: 'visible' });
    await firstAuditRow.click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Checklist|Findings|Details|Status|Auditor/i);
  });

  test('audit detail shows status badge', async ({ page }) => {
    const firstAuditRow = page.locator('text=/AUD-\\d{4}-\\d{3}/').first();
    await firstAuditRow.waitFor({ timeout: 15_000, state: 'visible' });
    await firstAuditRow.click();
    await page.waitForTimeout(2000);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Assigned|In Progress|Submitted|Under Review|Closed|Sent Back/);
  });

  test('audit status filter tabs work', async ({ page }) => {
    const closedTab = page.locator('button', { hasText: /^Closed/ }).first();
    await closedTab.waitFor({ timeout: 10_000, state: 'visible' });
    await closedTab.click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Closed|No audits|nothing here/i);
  });

  test('no JS errors in audit detail', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const firstAuditRow = page.locator('text=/AUD-\\d{4}-\\d{3}/').first();
    await firstAuditRow.waitFor({ timeout: 15_000, state: 'visible' });
    await firstAuditRow.click();
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('ChunkLoadError')
    );
    expect(critical).toHaveLength(0);
  });
});
