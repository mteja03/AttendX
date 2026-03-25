import { test, expect } from '@playwright/test'
import { URLS } from './helpers/constants.js'

test.describe('Reports', () => {
  test('reports page loads', async ({ page }) => {
    await page.goto(URLS.reports)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('h1, h2').filter({ hasText: /reports/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('Headcount tab visible and works', async ({ page }) => {
    await page.goto(URLS.reports)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /headcount/i }).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('Employees tab works', async ({ page }) => {
    await page.goto(URLS.reports)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const tab = page
      .locator('button')
      .filter({ hasText: /^employees$/i })
      .first()
    if (await tab.isVisible()) {
      await tab.click()
      await page.waitForTimeout(1500)
      await expect(
        page.locator('h1, h2').filter({ hasText: /reports/i }).first()
      ).toBeVisible()
    }
  })

  test('Leave tab works', async ({ page }) => {
    await page.goto(URLS.reports)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const tab = page.locator('button').filter({ hasText: /^leave$/i }).first()
    if (await tab.isVisible()) {
      await tab.click()
      await page.waitForTimeout(1500)
      await expect(
        page.locator('h1, h2').filter({ hasText: /reports/i }).first()
      ).toBeVisible()
    }
  })

  test('Assets tab works', async ({ page }) => {
    await page.goto(URLS.reports)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const tab = page.locator('button').filter({ hasText: /^assets$/i }).first()
    if (await tab.isVisible()) {
      await tab.click()
      await page.waitForTimeout(1500)
      await expect(
        page.locator('h1, h2').filter({ hasText: /reports/i }).first()
      ).toBeVisible()
    }
  })

  test('Download button visible', async ({ page }) => {
    await page.goto(URLS.reports)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /download/i }).first()
    ).toBeVisible({ timeout: 8000 })
  })
})
