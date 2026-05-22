import { test as setup } from '@playwright/test';

setup.setTimeout(180_000); // 3 minutes for manual login

setup.skip(() => fs.existsSync(AUTH_FILE), 'Session already saved — delete tests/e2e/.auth/user.json to re-authenticate');
import fs from 'fs';
import path from 'path';

const AUTH_FILE = 'tests/e2e/.auth/user.json';

setup('authenticate via Google', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.goto('/login');
  await page.waitForSelector('button:has-text("Continue with Google")', {
    timeout: 10_000,
  });

  const popupPromise = page.waitForEvent('popup');
  await page.click('button:has-text("Continue with Google")');
  const popup = await popupPromise;

  console.log('\n👉  Log in with sbmotorsinfo@gmail.com in the popup.');
  console.log('    You have 2 minutes...\n');

  await popup.waitForEvent('close', { timeout: 120_000 });
  console.log('\n⏳  Waiting for AttendX to finish signing you in...\n');

  // Admin lands on /companies after Firestore auth check
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 });

  await page.context().storageState({ path: AUTH_FILE });

  // Firebase uses IndexedDB — extract and save separately
  const idbData = await page.evaluate(async () => {
    return new Promise<Record<string, unknown>[]>((resolve) => {
      const req = indexedDB.open('firebaseLocalStorageDb');
      req.onsuccess = (ev: Event) => {
        const db = (ev.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) { resolve([]); return; }
        const tx = db.transaction('firebaseLocalStorage', 'readonly');
        const store = tx.objectStore('firebaseLocalStorage');
        const all = store.getAll();
        all.onsuccess = (e: Event) => resolve((e.target as IDBRequest).result as Record<string, unknown>[]);
        all.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
    });
  });

  const IDB_FILE = AUTH_FILE.replace('user.json', 'idb.json');
  fs.writeFileSync(IDB_FILE, JSON.stringify(idbData, null, 2));
  console.log('\n✅  Session saved →', AUTH_FILE);
  console.log(`    IndexedDB Firebase entries: ${idbData.length}${idbData.length === 0 ? ' ⚠️  None found!' : ''}\n`);
});
