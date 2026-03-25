import { chromium } from '@playwright/test'

/**
 * Run ONCE manually to save login session:
 *   node tests/setup/save-auth.js
 * Then run: npx playwright test
 */
async function saveAuth() {
  const browser = await chromium.launch({
    headless: false,
  })
  const context = await browser.newContext()
  const page = await context.newPage()

  console.log('Opening AttendX...')
  await page.goto('https://attendx-1cccb.web.app')

  console.log('Please sign in with Google manually...')
  console.log('Waiting for dashboard to load...')

  await page.waitForURL('**/companies**', { timeout: 120000 })

  console.log('Login successful! Saving session...')

  await context.storageState({ path: 'tests/setup/auth.json' })

  console.log('Auth saved to tests/setup/auth.json')
  console.log('You can now run: npx playwright test')

  await browser.close()
}

saveAuth().catch(console.error)
