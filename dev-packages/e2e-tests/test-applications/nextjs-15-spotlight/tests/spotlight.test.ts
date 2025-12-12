import { expect, test } from '@playwright/test';

test.describe('Spotlight auto-enablement in Next.js development mode', () => {
  test('Spotlight is automatically enabled when NEXT_PUBLIC_SENTRY_SPOTLIGHT=true', async ({ page }) => {
    // Capture console logs for debugging
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      const text = msg.text();
      consoleLogs.push(`[${msg.type()}] ${text}`);
      // Print Sentry debug logs immediately
      if (text.includes('[Sentry Debug]') || text.includes('Spotlight')) {
        console.log(`BROWSER: ${text}`);
      }
    });

    await page.goto('/');

    // Wait for client-side hydration and Sentry initialization
    await page.waitForTimeout(3000);

    // Print all console logs for debugging
    console.log('=== Browser Console Logs ===');
    consoleLogs.forEach(log => console.log(log));
    console.log('=== End Console Logs ===');

    // Check environment variable is accessible (injected at build time)
    const envValue = await page.getByTestId('env-value').textContent();
    console.log('env-value content:', envValue);
    expect(envValue).toContain('true');

    // Check globalThis value (set by valueInjectionLoader)
    const globalThisValue = await page.getByTestId('globalthis-value').textContent();
    console.log('globalthis-value content:', globalThisValue);

    // Check Spotlight integration is enabled
    const spotlightStatus = await page.getByTestId('spotlight-enabled').textContent();
    console.log('spotlight-enabled content:', spotlightStatus);
    expect(spotlightStatus).toBe('ENABLED');
  });

  test('no console errors during initialization', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      consoleErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors (if any)
    const criticalErrors = consoleErrors.filter(
      err =>
        err.includes('SyntaxError') ||
        err.includes('import.meta') ||
        err.includes('Unexpected token') ||
        err.includes('Cannot use'),
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
