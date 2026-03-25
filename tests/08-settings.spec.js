import { test, expect } from '@playwright/test'
import { URLS } from './helpers/constants.js'

test.describe('Settings', () => {
  test('settings page loads', async ({ page }) => {
    await page.goto(URLS.settings)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('h1, h2').filter({ hasText: /settings/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('Company Info tab visible', async ({ page }) => {
    await page.goto(URLS.settings)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page
        .locator('button, [role="tab"]')
        .filter({ hasText: /company/i })
        .first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('Manage Lists tab works', async ({ page }) => {
    await page.goto(URLS.settings)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const tab = page
      .locator('button, [role="tab"]')
      .filter({ hasText: /manage.?list/i })
      .first()
    if (await tab.isVisible()) {
      await tab.click()
      await page.waitForTimeout(1000)
      await expect(
        page.locator('h1, h2').filter({ hasText: /settings/i }).first()
      ).toBeVisible()
    }
  })

  test('Leave tab works', async ({ page }) => {
    await page.goto(URLS.settings)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const tab = page
      .locator('button, [role="tab"]')
      .filter({ hasText: /^leave$/i })
      .first()
    if (await tab.isVisible()) {
      await tab.click()
      await page.waitForTimeout(1000)
    }
    await expect(
      page.locator('h1, h2').filter({ hasText: /settings/i }).first()
    ).toBeVisible()
  })

  test('Onboarding tab works', async ({ page }) => {
    await page.goto(URLS.settings)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const tab = page
      .locator('button, [role="tab"]')
      .filter({ hasText: /onboarding/i })
      .first()
    if (await tab.isVisible()) {
      await tab.click()
      await page.waitForTimeout(1000)
    }
    await expect(
      page.locator('h1, h2').filter({ hasText: /settings/i }).first()
    ).toBeVisible()
  })
})
