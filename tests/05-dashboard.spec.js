import { test, expect } from '@playwright/test'

async function getFirstCompanyId(page) {
  await page.goto('https://attendx-1cccb.web.app/companies')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  const link = page.locator('a[href*="/company/"]').first()
  if ((await link.count()) > 0) {
    await link.click()
    await page.waitForLoadState('networkidle')
    return page.url().match(/\/company\/([^/]+)/)?.[1]
  }
  return null
}

test.describe('Dashboard', () => {
  test('dashboard loads without error', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/dashboard`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const errorMsg = page.locator('text=Something went wrong loading')
    await expect(errorMsg).not.toBeVisible()

    await expect(
      page
        .locator('h1:has-text("Dashboard"), h2:has-text("Dashboard")')
        .first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('stat cards visible on dashboard', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/dashboard`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const statCards = page.locator(
      '[class*="stat"], [class*="card"], [class*="Card"]'
    )
    const count = await statCards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('quick action buttons visible', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/dashboard`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await expect(
      page.locator('button:has-text("Add Employee")')
    ).toBeVisible({ timeout: 10000 })
  })
})
