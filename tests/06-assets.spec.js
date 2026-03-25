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

test.describe('Assets', () => {
  test('assets page loads', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/assets`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await expect(page.locator('text=Failed to load assets')).not.toBeVisible()

    await expect(
      page.locator('h1:has-text("Assets"), h2:has-text("Assets")').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('asset tabs visible', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/assets`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await expect(
      page
        .locator(
          'button:has-text("All Assets"), button:has-text("Trackable")'
        )
        .first()
    ).toBeVisible({ timeout: 10000 })
  })
})
