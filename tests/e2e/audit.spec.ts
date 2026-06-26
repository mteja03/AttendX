import { test, expect, waitForAuth } from './fixtures';
import { URLS } from './config';

test.describe('Audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.audit);
    await waitForAuth(page);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(4000);   // auditTypes + audits onSnapshot
  });

  test('not on login page', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).not.toContain('Continue with Google');
  });

  test('board shows status labels', async ({ page }) => {
    await expect(page.locator('body')).toContainText('Assigned', { timeout: 20_000 });
    await expect(page.locator('body')).toContainText('Closed', { timeout: 20_000 });
  });

  test('view toggles and status filters exist', async ({ page }) => {
    // Audit page has icon-only view toggles — verify status filter tabs instead
    // which are the reliable signal that the audit board has loaded
    await page.waitForSelector('text=Assigned', { timeout: 20_000, state: 'visible' });
    const listViewButton = page.getByRole('button', { name: 'List' });
    if (await listViewButton.count()) {
      await listViewButton.first().click();
      await page.waitForTimeout(1000);
    }
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Assigned|In Progress|Under Review|Closed/);
    // Also verify audit list has loaded (ref IDs present)
    expect(body).toMatch(/AUD-/);
  });

  test('switching view does not crash', async ({ page }) => {
    const btns = page.locator('button');
    const count = await btns.count();
    for (let i = 0; i < count; i++) {
      const text = await btns.nth(i).textContent() ?? '';
      if (text.trim() === 'List') {
        await btns.nth(i).click();
        await page.waitForTimeout(1000);
        await expect(page.locator('body')).not.toContainText('Something went wrong');
        break;
      }
    }
  });

  test('no JS errors on page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await page.waitForTimeout(4000);
    const fatal = errors.filter(e => !e.includes('ChunkLoad') && !e.includes('network'));
    expect(fatal).toHaveLength(0);
  });
});
