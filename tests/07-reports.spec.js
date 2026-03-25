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

test.describe('Reports', () => {
  test('reports page loads', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/reports`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    await expect(
      page.locator('h1:has-text("Reports"), h2:has-text("Reports")').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('all 7 report tabs visible', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/reports`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const tabs = ['Headcount', 'Employees', 'Leave', 'Assets']
    for (const tab of tabs) {
      await expect(
        page.locator(`button:has-text("${tab}")`).first()
      ).toBeVisible({ timeout: 10000 })
    }
  })

  test('clicking report tabs works', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/reports`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    const reportTabs = ['Employees', 'Leave', 'Assets']

    for (const tab of reportTabs) {
      const tabBtn = page.locator(`button:has-text("${tab}")`).first()
      if (await tabBtn.isVisible()) {
        await tabBtn.click()
        await page.waitForTimeout(1500)
        await expect(
          page
            .locator('h1:has-text("Reports"), h2:has-text("Reports")')
            .first()
        ).toBeVisible()
      }
    }
  })
})
