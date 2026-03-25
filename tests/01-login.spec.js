import { test, expect } from '@playwright/test'
import { BASE, URLS } from './helpers/constants.js'

test.describe('Login & Navigation', () => {
  test('login page loads correctly', async ({ page }) => {
    const browser = page.context().browser()
    if (!browser) {
      throw new Error('Browser instance not available')
    }
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await p.goto(BASE)
    await p.waitForLoadState('networkidle')
    await expect(p).toHaveTitle(/AttendX/)
    await expect(
      p.locator('button, [role="button"]')
        .filter({ hasText: /google|sign.?in|continue/i })
        .first()
    ).toBeVisible({ timeout: 8000 })
    await ctx.close()
  })

  test('authenticated user reaches app', async ({ page }) => {
    await page.goto(URLS.companies)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    expect(page.url()).not.toContain('login')
  })

  test('sidebar shows AttendX branding', async ({ page }) => {
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    await expect(page.locator('text=AttendX').first()).toBeVisible({
      timeout: 8000,
    })
  })

  test('sidebar has navigation links', async ({ page }) => {
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)
    for (const label of ['Dashboard', 'Employees', 'Leave']) {
      await expect(page.locator(`text=${label}`).first()).toBeVisible({
        timeout: 8000,
      })
    }
  })
})
