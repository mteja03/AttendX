import { chromium } from '@playwright/test'

/**
 * Run ONCE manually to save login session:
 *   node tests/setup/save-auth.js
 * Then run: npm test
 */
async function saveAuth() {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-automation',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  })

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/122.0.0.0 Safari/537.36',
  })

  const page = await context.newPage()

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    })
  })

  console.log('Opening AttendX...')
  await page.goto('https://attendx-1cccb.web.app')

  console.log('Please sign in with Google manually...')
  console.log('Waiting up to 3 minutes...')

  await page.waitForURL('**/companies**', { timeout: 180000 })

  console.log('Logged in! Saving session...')

  await context.storageState({
    path: 'tests/setup/auth.json',
  })

  console.log('Done! Auth saved.')
  console.log('Now run: npm test')

  await browser.close()
}

saveAuth().catch(console.error)
