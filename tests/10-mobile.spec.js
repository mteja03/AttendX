import { test, expect, devices } from '@playwright/test'

const iPhone = devices['iPhone 13']

test.describe('Mobile Responsive', () => {
  test('login page works on mobile', async ({ browser }) => {
    const context = await browser.newContext({ ...iPhone })
    const page = await context.newPage()

    await page.goto('https://attendx-1cccb.web.app')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('text=AttendX').first()).toBeVisible()

    await context.close()
  })

  test('companies page is mobile friendly', async ({ browser }) => {
    const context = await browser.newContext({
      ...iPhone,
      storageState: 'tests/setup/auth.json',
    })
    const page = await context.newPage()

    await page.goto('https://attendx-1cccb.web.app/companies')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)

    expect(scrollWidth - viewportWidth).toBeLessThan(20)

    await context.close()
  })
})
