import { test, expect } from '@playwright/test'
import { URLS } from './helpers/constants.js'

test.describe('Assets', () => {
  test('assets page loads', async ({ page }) => {
    await page.goto(URLS.assets)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('h1, h2').filter({ hasText: /assets/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('no failed to load toast', async ({ page }) => {
    await page.goto(URLS.assets)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(
      page.locator('text=Failed to load assets')
    ).not.toBeVisible()
  })

  test('asset stat cards visible', async ({ page }) => {
    await page.goto(URLS.assets)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('text=/Total Assets|Trackable|Consumable/i').first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('All Assets tab visible', async ({ page }) => {
    await page.goto(URLS.assets)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /all.?assets/i }).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('Trackable tab visible', async ({ page }) => {
    await page.goto(URLS.assets)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /trackable/i }).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('Add Asset button visible', async ({ page }) => {
    await page.goto(URLS.assets)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /add.?asset/i }).first()
    ).toBeVisible({ timeout: 8000 })
  })
})
