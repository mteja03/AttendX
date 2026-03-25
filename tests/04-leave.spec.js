import { test, expect } from '@playwright/test'

async function getFirstCompanyId(page) {
  await page.goto('https://attendx-1cccb.web.app/companies')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  const firstCompany = page.locator('a[href*="/company/"]').first()
  if ((await firstCompany.count()) > 0) {
    await firstCompany.click()
    await page.waitForLoadState('networkidle')
    return page.url().match(/\/company\/([^/]+)/)?.[1]
  }
  return null
}

test.describe('Leave Management', () => {
  test('leave page loads', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/leave`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('h1:has-text("Leave"), h2:has-text("Leave")').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('add leave button visible', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/leave`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await expect(
      page
        .locator(
          'button:has-text("Add Leave"), button:has-text("Apply Leave"), button:has-text("New Leave")'
        )
        .first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('leave filters visible', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/leave`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const pending = page
      .locator('button:has-text("Pending"), text=Pending')
      .first()
    await expect(pending).toBeVisible({ timeout: 10000 })
  })
})
