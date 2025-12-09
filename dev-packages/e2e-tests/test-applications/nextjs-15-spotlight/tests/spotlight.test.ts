import { expect, test } from '@playwright/test';

test.describe('Spotlight auto-enablement in Next.js development mode', () => {
  test('Spotlight is automatically enabled when NEXT_PUBLIC_SENTRY_SPOTLIGHT=true', async ({ page }) => {
    await page.goto('/');

    // Wait for client-side hydration and Sentry initialization
    await page.waitForTimeout(2000);

    // Check environment variable is accessible
    const envValue = await page.getByTestId('env-value').textContent();
    expect(envValue).toContain('true');

    // Check Spotlight integration is enabled
    const spotlightStatus = await page.getByTestId('spotlight-enabled').textContent();
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
