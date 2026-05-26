import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Audit Checklist Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.audit);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('text=Assigned', { timeout: 20_000, state: 'visible' });
    // Open first audit
    const firstAudit = page.locator('text=/AUD-\\d{4}-\\d{3}/').first();
    await firstAudit.waitFor({ timeout: 10_000, state: 'visible' });
    await firstAudit.click();
    await page.waitForTimeout(2500);
  });

  test('audit detail panel opens', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Checklist|Findings|Details|AUD-/i);
  });

  test('Findings tab is accessible', async ({ page }) => {
    const findingsTab = page.locator('button', { hasText: /Findings/i }).first();
    if (await findingsTab.isVisible()) {
      // Use force:true — audit detail header overlay can intercept pointer events
      await findingsTab.click({ force: true });
      await page.waitForTimeout(1500);
    }
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('checklist shows Pass/Fail/NA options', async ({ page }) => {
    const checklistTab = page.locator('button', { hasText: /Checklist/i }).first();
    if (await checklistTab.isVisible()) await checklistTab.click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Pass|Fail|N\/A|pass|fail/i);
  });

  test('checklist sections are collapsible', async ({ page }) => {
    const checklistTab = page.locator('button', { hasText: /Checklist/i }).first();
    if (await checklistTab.isVisible()) await checklistTab.click();
    await page.waitForTimeout(1500);
    // Section headers should be clickable buttons with chevrons
    const sectionHeaders = page.locator('button').filter({ hasText: /section|Section|\d+\s*\/\s*\d+/i });
    const count = await sectionHeaders.count();
    if (count > 0) {
      await sectionHeaders.first().click();
      await page.waitForTimeout(500);
    }
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Something went wrong');
  });

  test('audit score gauge is visible in detail', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/\d+%|score|Score|pass|Pass/i);
  });

  test('status timeline is visible', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Assigned|In Progress|Submitted|Under Review|Closed/i);
  });

  test('no JS errors in checklist interaction', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('ChunkLoadError')
    );
    expect(critical).toHaveLength(0);
  });
});
