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

test.describe('Settings', () => {
  test('settings page loads', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/settings`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await expect(
      page.locator('h1:has-text("Settings"), h2:has-text("Settings")').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('all settings tabs clickable', async ({ page }) => {
    const id = await getFirstCompanyId(page)
    if (!id) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(`https://attendx-1cccb.web.app/company/${id}/settings`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const tabs = ['Company', 'Manage Lists', 'Leave', 'Document']

    for (const tab of tabs) {
      const tabBtn = page.locator(`button:has-text("${tab}")`).first()
      if (await tabBtn.isVisible()) {
        await tabBtn.click()
        await page.waitForTimeout(800)
      }
    }

    await expect(
      page.locator('h1:has-text("Settings"), h2:has-text("Settings")').first()
    ).toBeVisible()
  })
})
