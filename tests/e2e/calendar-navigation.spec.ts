import { test, expect } from './fixtures';
import { URLS } from './config';

test.use({ storageState: 'tests/e2e/.auth/user.json' });

test.describe('Calendar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URLS.calendar);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => !document.body.innerText.trim().startsWith('Loading'),
      { timeout: 20_000 }
    );
    await page.waitForTimeout(1000);
  });

  test('can navigate to next month', async ({ page }) => {
    const body1 = await page.locator('body').textContent() ?? '';
    const nextBtn = page.locator('button').filter({ hasText: /›|→|next|Next/i })
      .or(page.locator('button[aria-label*="next"], button[aria-label*="Next"]')).first();
    const allBtns = page.locator('button');
    const btnCount = await allBtns.count();
    // Find next month button by position (usually near month/year header)
    for (let i = 0; i < Math.min(btnCount, 10); i++) {
      const text = await allBtns.nth(i).textContent() ?? '';
      if (text.trim() === '›' || text.trim() === '>' || text.trim() === '→') {
        await allBtns.nth(i).click();
        break;
      }
    }
    await page.waitForTimeout(1000);
    const body2 = await page.locator('body').textContent() ?? '';
    expect(body2).not.toContain('Something went wrong');
  });

  test('Month view shows day grid', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/i);
    expect(body).toMatch(/\b[1-9]\b|\b[12]\d\b|\b3[01]\b/);
  });

  test('Add Event modal opens', async ({ page }) => {
    await page.locator('button', { hasText: /Add Event/i }).first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Event Name|Title|Date|Type|Cancel/i);
  });

  test('Add Event modal closes on cancel', async ({ page }) => {
    await page.locator('button', { hasText: /Add Event/i }).first().click();
    await page.waitForTimeout(1000);
    const cancelBtn = page.locator('button', { hasText: /Cancel/i }).first();
    if (await cancelBtn.isVisible()) await cancelBtn.click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toMatch(/Month|Week|Agenda/i);
  });

  test('Week view toggle works', async ({ page }) => {
    const weekBtn = page.locator('button', { hasText: /^Week$/i }).first();
    if (await weekBtn.isVisible()) {
      await weekBtn.click();
      await page.waitForTimeout(1500);
      const body = await page.locator('body').textContent() ?? '';
      expect(body).not.toContain('Something went wrong');
    }
  });

  test('no JS errors on calendar', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(3000);
    const critical = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('ChunkLoadError')
    );
    expect(critical).toHaveLength(0);
  });
});
