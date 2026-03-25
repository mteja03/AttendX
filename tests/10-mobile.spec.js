import { test, expect, devices } from '@playwright/test'
import { URLS, BASE } from './helpers/constants.js'

const iPhone = devices['iPhone 13']

test.describe('Mobile Responsive', () => {
  test('login page works on mobile', async ({ browser }) => {
    const ctx = await browser.newContext({ ...iPhone })
    const page = await ctx.newPage()
    await page.goto(BASE)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=AttendX').first()).toBeVisible({
      timeout: 8000,
    })
    await ctx.close()
  })

  test('dashboard works on mobile', async ({ browser }) => {
    const ctx = await browser.newContext({
      ...iPhone,
      storageState: 'tests/setup/auth.json',
    })
    const page = await ctx.newPage()
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(page.locator('text=AttendX').first()).toBeVisible({
      timeout: 8000,
    })
    await ctx.close()
  })

  test('employees page works on mobile', async ({ browser }) => {
    const ctx = await browser.newContext({
      ...iPhone,
      storageState: 'tests/setup/auth.json',
    })
    const page = await ctx.newPage()
    await page.goto(URLS.employees)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await expect(
      page.locator('h1, h2').filter({ hasText: /employees/i }).first()
    ).toBeVisible({ timeout: 10000 })
    await ctx.close()
  })

  test('no horizontal scroll on dashboard', async ({ browser }) => {
    const ctx = await browser.newContext({
      ...iPhone,
      storageState: 'tests/setup/auth.json',
    })
    const page = await ctx.newPage()
    await page.goto(URLS.dashboard)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const overflow = await page.evaluate(
      () => document.body.scrollWidth - window.innerWidth
    )
    expect(overflow).toBeLessThan(20)
    await ctx.close()
  })

  test('no horizontal scroll on employees', async ({ browser }) => {
    const ctx = await browser.newContext({
      ...iPhone,
      storageState: 'tests/setup/auth.json',
    })
    const page = await ctx.newPage()
    await page.goto(URLS.employees)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    const overflow = await page.evaluate(
      () => document.body.scrollWidth - window.innerWidth
    )
    expect(overflow).toBeLessThan(20)
    await ctx.close()
  })
})
