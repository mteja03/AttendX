import { test, expect } from '@playwright/test'
import { URLS } from './helpers/constants.js'

test.describe('Calendar & Org Chart', () => {
  test('calendar page loads', async ({ page }) => {
    await page.goto(URLS.calendar)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('h1, h2').filter({ hasText: /calendar/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('calendar shows current month', async ({ page }) => {
    await page.goto(URLS.calendar)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page
        .locator(
          'text=/January|February|March|April|May|June|July|August|September|October|November|December/i'
        )
        .first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('calendar shows weekday headers', async ({ page }) => {
    await page.goto(URLS.calendar)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(page.locator('text=/Mon|Monday/i').first()).toBeVisible({
      timeout: 8000,
    })
  })

  test('Add Event button visible', async ({ page }) => {
    await page.goto(URLS.calendar)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /add.?event/i }).first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('org chart page loads', async ({ page }) => {
    await page.goto(URLS.orgchart)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(
      page.locator('h1, h2').filter({ hasText: /org.?chart/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('org chart shows employees', async ({ page }) => {
    await page.goto(URLS.orgchart)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(
      page.locator('text=/Rahul|Priya|Arjun|Sri/i').first()
    ).toBeVisible({ timeout: 8000 })
  })

  test('Download PNG button visible', async ({ page }) => {
    await page.goto(URLS.orgchart)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /download/i }).first()
    ).toBeVisible({ timeout: 8000 })
  })
})
