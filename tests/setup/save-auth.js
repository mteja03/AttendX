import { chromium } from '@playwright/test'
import fs from 'fs'

async function saveAuth() {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  })

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko)' +
      ' Chrome/122.0.0.0 Safari/537.36',
  })

  const page = await context.newPage()

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })

  console.log('\nOpening AttendX...')
  console.log('Please sign in with Google.\n')
  await page.goto('https://attendx-1cccb.web.app')

  await page.waitForURL('**/companies**', {
    timeout: 180000,
  })

  console.log('Signed in! Extracting session...')
  await page.waitForTimeout(2000)

  const firebaseAuth = await page.evaluate(() => {
    return new Promise((resolve) => {
      const req = indexedDB.open('firebaseLocalStorageDb')
      req.onsuccess = (e) => {
        const db = e.target.result
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
          resolve(null)
          return
        }
        const tx = db.transaction('firebaseLocalStorage', 'readonly')
        const store = tx.objectStore('firebaseLocalStorage')
        store.getAll().onsuccess = (event) => {
          resolve(event.target.result)
        }
      }
      req.onerror = () => resolve(null)
    })
  })

  if (firebaseAuth && firebaseAuth.length > 0) {
    fs.writeFileSync(
      'tests/setup/firebase-auth.json',
      JSON.stringify(firebaseAuth, null, 2)
    )
    console.log('Firebase auth saved!')
  } else {
    console.log('Warning: Could not extract Firebase auth from IndexedDB')
  }

  await context.storageState({
    path: 'tests/setup/auth.json',
  })

  console.log('\nDone! Session saved.')
  console.log('Run: npm test\n')

  await browser.close()
}

saveAuth().catch(console.error)
