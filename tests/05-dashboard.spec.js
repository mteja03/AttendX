import { test, expect } from '@playwright/test'
import { URLS } from './helpers/constants.js'

test.describe('Dashboard', () => {
  test('dashboard loads without crash', async ({ page }) => {
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(
      page.locator('text=Something went wrong loading')
    ).not.toBeVisible()
  })

  test('dashboard shows heading', async ({ page }) => {
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('h1, h2').filter({ hasText: /dashboard/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('stat cards are visible', async ({ page }) => {
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(
      page.locator('text=/Total|Employees|Active/i').first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('Add Employee button on dashboard', async ({ page }) => {
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /add.?employee/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('Recent Leave Requests visible', async ({ page }) => {
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(
      page.locator('text=/recent.?leave|leave.?request/i').first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('no failed to load errors', async ({ page }) => {
    const errors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(page.locator('text=Failed to load')).not.toBeVisible()
  })
})
