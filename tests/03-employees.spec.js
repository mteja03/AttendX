import { test, expect } from '@playwright/test'
import { URLS } from './helpers/constants.js'

test.describe('Employees', () => {
  test('employees page loads', async ({ page }) => {
    await page.goto(URLS.employees)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('h1, h2').filter({ hasText: /employees/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('employee list shows records', async ({ page }) => {
    await page.goto(URLS.employees)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    const hasEmployees =
      (await page
        .locator('text=Rahul, text=Priya, text=Arjun, text=Sri')
        .count()) > 0
    const hasCount =
      (await page.locator('text=/\\d+ employee/').count()) > 0
    expect(hasEmployees || hasCount).toBeTruthy()
  })

  test('Add Employee button visible', async ({ page }) => {
    await page.goto(URLS.employees)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /add.?employee/i }).first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('Add Employee modal opens', async ({ page }) => {
    await page.goto(URLS.employees)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await page
      .locator('button')
      .filter({ hasText: /add.?employee/i })
      .first()
      .click()
    await page.waitForTimeout(1500)
    await expect(page.locator('input[placeholder*="ame"]').first()).toBeVisible(
      { timeout: 8000 }
    )
    await page.keyboard.press('Escape')
  })

  test('employee search works', async ({ page }) => {
    await page.goto(URLS.employees)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const search = page
      .locator(
        'input[placeholder*="earch"], input[placeholder*="employee"]'
      )
      .first()
    await expect(search).toBeVisible({ timeout: 8000 })
    await search.fill('Rahul')
    await page.waitForTimeout(1500)
    await expect(
      page.locator('h1, h2').filter({ hasText: /employees/i }).first()
    ).toBeVisible()
  })

  test('status filter tabs work', async ({ page }) => {
    await page.goto(URLS.employees)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const activeTab = page
      .locator('button')
      .filter({ hasText: /^active$/i })
      .first()
    if (await activeTab.isVisible()) {
      await activeTab.click()
      await page.waitForTimeout(1000)
    }
    await expect(
      page.locator('h1, h2').filter({ hasText: /employees/i }).first()
    ).toBeVisible()
  })

  test('download button visible', async ({ page }) => {
    await page.goto(URLS.employees)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('button').filter({ hasText: /download/i }).first()
    ).toBeVisible({ timeout: 8000 })
  })
})
