import { test, expect } from '@playwright/test'
import { URLS } from './helpers/constants.js'

test.describe('Companies', () => {
  test('companies page loads', async ({ page }) => {
    await page.goto(URLS.companies)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    expect(page.url()).not.toContain('login')
    await expect(page.locator('body')).toBeVisible()
  })

  test('TechCorp company visible', async ({ page }) => {
    await page.goto(URLS.companies)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(page.locator('text=TechCorp').first()).toBeVisible({
      timeout: 10000,
    })
  })

  test('Add Company button visible', async ({ page }) => {
    await page.goto(URLS.companies)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /add.?company/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('can navigate into TechCorp', async ({ page }) => {
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(page.locator('text=TechCorp').first()).toBeVisible({
      timeout: 8000,
    })
  })
})
