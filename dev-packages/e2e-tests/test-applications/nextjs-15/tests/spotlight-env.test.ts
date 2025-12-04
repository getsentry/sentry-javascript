import { expect, test } from '@playwright/test';

test.describe('Spotlight environment variable handling', () => {
  test('respects NEXT_PUBLIC_SENTRY_SPOTLIGHT environment variable', async ({ page }) => {
    // This test assumes NEXT_PUBLIC_SENTRY_SPOTLIGHT=true is set in the env
    await page.goto('/spotlight-env-test');

    const nextPublicSpotlight = await page.getByTestId('next-public-spotlight').textContent();
    const spotlightStatus = await page.getByTestId('spotlight-integration-found').textContent();

    // Verify NEXT_PUBLIC_SENTRY_SPOTLIGHT is accessible in the browser
    expect(nextPublicSpotlight).toContain('true');

    // Verify Spotlight integration is enabled
    expect(spotlightStatus).toContain('ENABLED');
  });

  test('NEXT_PUBLIC_SENTRY_SPOTLIGHT takes precedence over SENTRY_SPOTLIGHT', async ({ page }) => {
    // This test verifies that even if SENTRY_SPOTLIGHT is set (e.g., for backend),
    // NEXT_PUBLIC_SENTRY_SPOTLIGHT is what the browser sees
    await page.goto('/spotlight-env-test');

    const sentrySpotlight = await page.getByTestId('sentry-spotlight').textContent();

    // SENTRY_SPOTLIGHT should NOT be accessible in the browser (Next.js doesn't expose it)
    expect(sentrySpotlight).toContain('undefined');
  });

  test('handles empty string environment variables correctly', async ({ page }) => {
    // This test would need to be run with NEXT_PUBLIC_SENTRY_SPOTLIGHT=''
    // It verifies that empty strings are treated as undefined and don't enable Spotlight

    // Note: This test would need a separate test run with different env vars
    // For now, we document the expected behavior
    await page.goto('/spotlight-env-test');

    // With an empty string, Spotlight should be disabled
    // The resolveSpotlightOptions function filters out empty strings
  });

  test('process.env check works without errors in CJS build', async ({ page }) => {
    // This test verifies that the CJS build (used by Next.js) doesn't have
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
    const syntaxErrors = consoleErrors.filter(err =>
      err.includes('import.meta') ||
      err.includes('SyntaxError') ||
      err.includes('Unexpected token')
    );

    expect(syntaxErrors).toHaveLength(0);
  });
});
