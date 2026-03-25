import { chromium } from '@playwright/test'
import fs from 'fs'

export default async function globalSetup() {
  const authFile = 'tests/setup/firebase-auth.json'

  if (!fs.existsSync(authFile)) {
    console.error('
ERROR: No Firebase auth found!
Run: node tests/setup/save-auth.js
')
    process.exit(1)
  }

  const firebaseAuth = JSON.parse(fs.readFileSync(authFile, 'utf8'))

  if (!firebaseAuth || firebaseAuth.length === 0) {
    console.error('
ERROR: Firebase auth file is empty!
Run: node tests/setup/save-auth.js
')
    process.exit(1)
  }

  console.log('
Injecting Firebase auth...')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('https://attendx-1cccb.web.app')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)

  for (const entry of firebaseAuth) {
    await page.evaluate(async (authEntry) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('firebaseLocalStorageDb', 1)

        req.onupgradeneeded = (e) => {
          const db = e.target.result
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
            db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' })
          }
        }

        req.onsuccess = (e) => {
          const db = e.target.result
          const tx = db.transaction('firebaseLocalStorage', 'readwrite')
          const store = tx.objectStore('firebaseLocalStorage')
          store.put(authEntry)
          tx.oncomplete = () => resolve()
          tx.onerror = reject
        }
        req.onerror = reject
      })
    }, entry)
  }

  console.log('Reloading to verify auth...')
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  const url = page.url()

  if (url.includes('login')) {
    console.error(
      '
ERROR: Auth injection failed - still on login page.
Token may have expired.
Run: node tests/setup/save-auth.js
'
    )
    await browser.close()
    process.exit(1)
  }

  console.log('Auth verified at:', url)

  await context.storageState({
    path: 'tests/setup/auth.json',
  })

  console.log('Auth state saved for tests
')
  await browser.close()
}
