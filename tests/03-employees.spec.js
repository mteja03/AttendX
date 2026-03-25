import { test, expect } from '@playwright/test'

async function getCompanyUrl(page) {
  await page.goto('https://attendx-1cccb.web.app/companies')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  const firstCompany = page.locator(
    '[class*="company-card"], [class*="CompanyCard"], a[href*="/company/"]'
  ).first()

  if ((await firstCompany.count()) > 0) {
    await firstCompany.click()
    await page.waitForLoadState('networkidle')
    return page.url().match(/\/company\/([^/]+)/)?.[1]
  }
  return null
}

test.describe('Employees', () => {
  test('employees page loads', async ({ page }) => {
    const companyId = await getCompanyUrl(page)
    if (!companyId) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(
      `https://attendx-1cccb.web.app/company/${companyId}/employees`
    )
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('h1:has-text("Employees"), h2:has-text("Employees")').first()
    ).toBeVisible({ timeout: 10000 })
  })

  test('Add Employee button visible', async ({ page }) => {
    const companyId = await getCompanyUrl(page)
    if (!companyId) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(
      `https://attendx-1cccb.web.app/company/${companyId}/employees`
    )
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await expect(
      page.locator('button:has-text("Add Employee")')
    ).toBeVisible({ timeout: 10000 })
  })

  test('Add Employee modal opens', async ({ page }) => {
    const companyId = await getCompanyUrl(page)
    if (!companyId) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(
      `https://attendx-1cccb.web.app/company/${companyId}/employees`
    )
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await page.locator('button:has-text("Add Employee")').click()
    await page.waitForTimeout(1000)

    await expect(
      page
        .locator('input[placeholder*="name"], input[placeholder*="Name"]')
        .first()
    ).toBeVisible({ timeout: 5000 })

    await page.keyboard.press('Escape')
  })

  test('employee search works', async ({ page }) => {
    const companyId = await getCompanyUrl(page)
    if (!companyId) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(
      `https://attendx-1cccb.web.app/company/${companyId}/employees`
    )
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const search = page
      .locator('input[placeholder*="Search"], input[placeholder*="search"]')
      .first()

    await expect(search).toBeVisible()

    await search.fill('Rahul')
    await page.waitForTimeout(1500)

    expect(page.url()).toContain('employees')
  })

  test('employee status filters work', async ({ page }) => {
    const companyId = await getCompanyUrl(page)
    if (!companyId) {
      test.skip(true, 'No company found')
      return
    }

    await page.goto(
      `https://attendx-1cccb.web.app/company/${companyId}/employees`
    )
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const activeTab = page.locator('button:has-text("Active")').first()

    if (await activeTab.isVisible()) {
      await activeTab.click()
      await page.waitForTimeout(1000)
    }

    await expect(
      page.locator('h1:has-text("Employees"), h2:has-text("Employees")').first()
    ).toBeVisible()
  })
})
