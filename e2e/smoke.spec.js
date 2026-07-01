// @ts-check
import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Public pages — no auth required
// ---------------------------------------------------------------------------
test.describe('Public pages', () => {

  test('landing page loads', async ({ page }) => {
    await page.goto('/home');
    // The h1 reads "HR platform built for growing companies"
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('HR platform');
    await expect(page).toHaveTitle(/AttendX/i);
  });

  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    // AttendX uses Google OAuth — there is no email/password form.
    // The only sign-in affordance is the "Continue with Google" button.
    const googleBtn = page.getByRole('button', { name: /Continue with Google/i });
    await expect(googleBtn).toBeVisible();
    // Page should carry the brand name
    await expect(page.locator('body')).toContainText('AttendX');
  });

  test('login page has Google sign-in button that is enabled', async ({ page }) => {
    await page.goto('/login');
    const googleBtn = page.getByRole('button', { name: /Continue with Google/i });
    await expect(googleBtn).toBeVisible();
    await expect(googleBtn).toBeEnabled();
  });

  test('features page loads', async ({ page }) => {
    const response = await page.goto('/features');
    // Firebase Hosting always returns 200 (SPA); assert main content is visible.
    expect(response?.status()).toBeLessThan(400);
    // Page title is set to "AttendX — HR Platform for Growing Companies"
    await expect(page).toHaveTitle(/AttendX/i);
    // Some meaningful content should render
    await expect(page.locator('body')).not.toBeEmpty();
    // The features page has at least one visible heading
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('about page loads', async ({ page }) => {
    const response = await page.goto('/about');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/AttendX/i);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('unauthenticated root redirects away from /', async ({ page }) => {
    await page.goto('/');
    // ProtectedRoute redirects unauthenticated users to /home;
    // the catch-all also maps unknown paths to /home.
    await page.waitForURL((url) => url.pathname !== '/', { timeout: 10_000 });
    const pathname = new URL(page.url()).pathname;
    expect(['/home', '/login']).toContain(pathname);
  });

  test('404 / unknown path redirects to /home', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz');
    // App.jsx has <Route path="*" element={<Navigate to="/home" replace />} />
    await page.waitForURL((url) => url.pathname !== '/nonexistent-page-xyz', { timeout: 10_000 });
    const pathname = new URL(page.url()).pathname;
    expect(['/home', '/login']).toContain(pathname);
  });

});

// ---------------------------------------------------------------------------
// Login page interactions
// ---------------------------------------------------------------------------
test.describe('Login page interactions', () => {

  test('Google sign-in button stays enabled when idle', async ({ page }) => {
    await page.goto('/login');
    const googleBtn = page.getByRole('button', { name: /Continue with Google/i });
    await expect(googleBtn).toBeEnabled();
    // The button should not be in a loading/busy state on initial render
    await expect(googleBtn).not.toHaveAttribute('aria-busy', 'true');
  });

  test('clicking sign-in button enters loading state', async ({ page }) => {
    await page.goto('/login');
    const googleBtn = page.getByRole('button', { name: /Continue with Google/i });
    await expect(googleBtn).toBeEnabled();

    // Intercept the popup that Firebase opens so we don't block on it
    page.on('popup', async (popup) => {
      // Close it immediately — we only care about the loading state
      await popup.close().catch(() => {});
    });

    await googleBtn.click();

    // After clicking, the button should indicate a busy/loading state
    // (aria-busy="true" and text changes to "Signing you in…")
    await expect(googleBtn).toHaveAttribute('aria-busy', 'true', { timeout: 5_000 });
  });

});
