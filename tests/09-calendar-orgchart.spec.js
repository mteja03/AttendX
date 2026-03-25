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

test.describe('Calendar & Org Chart', () => {
  test('calendar page loads', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/calendar`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    await expect(
      page
        .locator(
          'h1:has-text("Calendar"), h2:has-text("Calendar"), text=March, text=April, text=January, text=February'
        )
        .first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('calendar shows month grid', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/calendar`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await expect(
      page.locator('text=Mon, text=Monday').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('org chart loads', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/orgchart`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    await expect(
      page
        .locator(
          'h1:has-text("Org"), h2:has-text("Org"), text=Org Chart'
        )
        .first()
    ).toBeVisible({ timeout: 10000 })
  })
})
