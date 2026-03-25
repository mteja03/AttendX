import { test, expect } from '@playwright/test'
import { URLS } from './helpers/constants.js'

test.describe('Leave Management', () => {
  test('leave page loads', async ({ page }) => {
    await page.goto(URLS.leave)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('h1, h2').filter({ hasText: /leave/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('leave stats visible', async ({ page }) => {
    await page.goto(URLS.leave)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const stats = page.locator(
      '[class*="stat"], [class*="card"],[class*="count"]'
    )
    expect(await stats.count()).toBeGreaterThan(0)
  })

  test('Add Leave button visible', async ({ page }) => {
    await page.goto(URLS.leave)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page
        .locator('button')
        .filter({ hasText: /add.?leave|apply/i })
        .first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('leave filter tabs visible', async ({ page }) => {
    await page.goto(URLS.leave)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page
        .locator('button, [role="tab"]')
        .filter({ hasText: /pending|all/i })
        .first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('download button visible', async ({ page }) => {
    await page.goto(URLS.leave)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /download/i }).first()
    ).toBeVisible({ timeout: 8000 })
  })
})
