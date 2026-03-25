import { test, expect } from '@playwright/test'

test.describe('Login & Navigation', () => {
  test('should load login page', async ({ page }) => {
    const browser = page.context().browser()
    if (!browser) {
      throw new Error('Browser instance not available')
    }
    const freshContext = await browser.newContext()
    const freshPage = await freshContext.newPage()

    await freshPage.goto('https://attendx-1cccb.web.app')
    await freshPage.waitForLoadState('networkidle')

    await expect(freshPage).toHaveTitle(/AttendX/)

    await expect(
      freshPage
        .locator(
          'button:has-text("Google"), button:has-text("Sign in"), button:has-text("Continue")'
        )
        .first()
    ).toBeVisible()

    await freshContext.close()
  })

  test('authenticated user sees companies', async ({ page }) => {
    await page.goto('https://attendx-1cccb.web.app')
    await page.waitForLoadState('networkidle')

    const url = page.url()
    expect(url.includes('companies') || url.includes('company')).toBeTruthy()
  })

  test('sidebar navigation is visible', async ({ page }) => {
    await page.goto('https://attendx-1cccb.web.app')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=AttendX').first()).toBeVisible()
  })
})
