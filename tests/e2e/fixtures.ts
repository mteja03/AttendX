import { test as base, expect, Page } from '@playwright/test';
import fs from 'fs';
const IDB_FILE = 'tests/e2e/.auth/idb.json';

async function injectFirebaseAuth(page: Page) {
  if (!fs.existsSync(IDB_FILE)) return;
  const idbData: Record<string, unknown>[] = JSON.parse(fs.readFileSync(IDB_FILE, 'utf8'));
  if (!idbData.length) return;

  // addInitScript runs before any page scripts — writes Firebase auth to IndexedDB
  // Firebase SDK loads ~500ms later via Vite bundle, so write completes first
  await page.addInitScript((data: Record<string, unknown>[]) => {
    const openReq = indexedDB.open('firebaseLocalStorageDb', 1);
    openReq.onupgradeneeded = (ev: Event) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
        db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
      }
    };
    openReq.onsuccess = (ev: Event) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      const tx = db.transaction('firebaseLocalStorage', 'readwrite');
      const store = tx.objectStore('firebaseLocalStorage');
      data.forEach((item) => store.put(item));
    };
  }, idbData);
}

/** Wait until app shows authenticated UI (not the login page) */
export async function waitForAuth(page: Page, timeout = 30_000) {
  await page.waitForFunction(
    () => !document.body.innerText.includes('Continue with Google'),
    { timeout }
  );
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await injectFirebaseAuth(page);
    await use(page);
  },
});

export { expect };
