import { expect, test } from '@playwright/test';

test.describe('Spotlight environment variable handling', () => {
  test('NEXT_PUBLIC_SENTRY_SPOTLIGHT is accessible in browser', async ({ page }) => {
    // NEXT_PUBLIC_SENTRY_SPOTLIGHT=true is set in next.config.js
    await page.goto('/spotlight-env-test');

    const nextPublicSpotlight = await page.getByTestId('next-public-spotlight').textContent();

    // Verify NEXT_PUBLIC_SENTRY_SPOTLIGHT is accessible in the browser (embedded at build time)
    expect(nextPublicSpotlight).toContain('true');
  });

  test('SENTRY_SPOTLIGHT (server-only) is NOT accessible in browser', async ({ page }) => {
    // This test verifies that even if SENTRY_SPOTLIGHT is set (e.g., for backend),
    // it's NOT exposed to the browser - only NEXT_PUBLIC_* vars are exposed
    await page.goto('/spotlight-env-test');

    const sentrySpotlight = await page.getByTestId('sentry-spotlight').textContent();

    // SENTRY_SPOTLIGHT should NOT be accessible in the browser (Next.js doesn't expose it)
    expect(sentrySpotlight).toContain('undefined');
  });

  test('no import.meta syntax errors in Next.js bundle', async ({ page }) => {
    // This test verifies that the CJS build (used by Next.js webpack) doesn't have
    // import.meta syntax which would cause parse errors

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      consoleErrors.push(error.message);
    });

    await page.goto('/spotlight-env-test');

    // Wait for the page to be fully loaded
    await page.waitForTimeout(1000);

    // Should have no syntax errors from import.meta in CJS build
    const syntaxErrors = consoleErrors.filter(
      err => err.includes('import.meta') || err.includes('SyntaxError') || err.includes('Unexpected token'),
    );

    expect(syntaxErrors).toHaveLength(0);
  });
});
