import { expect } from '@playwright/test'

export const TEST_URL = 'https://attendx-1cccb.web.app'

export const ADMIN_EMAIL = 'mteja0852@gmail.com'

/** Wait for app network to settle and a short UI buffer */
export async function waitForApp(page) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
}

/** Assert a toast contains the given text */
export async function expectToast(page, text) {
  await expect(
    page.locator('[class*="toast"], [class*="Toast"]').first()
  ).toContainText(text, { timeout: 5000 })
}

/** Full-page screenshot for debugging failures */
export async function screenshot(page, name) {
  await page.screenshot({
    path: `tests/screenshots/${name}.png`,
    fullPage: true,
  })
}
