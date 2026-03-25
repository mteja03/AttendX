import { test, expect } from '@playwright/test'

const BASE = 'https://attendx-1cccb.web.app'

test.describe('Companies', () => {
  test('companies page loads', async ({ page }) => {
    await page.goto(`${BASE}/companies`)
    await page.waitForLoadState('networkidle')

    await expect(
      page
        .locator(
          'h1:has-text("Companies"), h2:has-text("Companies"), text=All Companies'
        )
        .first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('can see company list or empty state', async ({ page }) => {
    await page.goto(`${BASE}/companies`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const hasCompanies = await page
      .locator(
        '[class*="company"], text=TechCorp, text=GreenStar'
      )
      .count()

    const hasEmpty = await page
      .locator('text=No companies, text=Add your first')
      .count()

    expect(hasCompanies + hasEmpty).toBeGreaterThan(0)
  })

  test('Add Company button visible for admin', async ({ page }) => {
    await page.goto(`${BASE}/companies`)
    await page.waitForLoadState('networkidle')

    await expect(
      page
        .locator(
          'button:has-text("Add Company"), button:has-text("New Company")'
        )
        .first()
    ).toBeVisible({ timeout: 10000 })
  })
})
