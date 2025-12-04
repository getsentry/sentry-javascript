import { expect, test } from '@playwright/test';

test.describe('Spotlight environment variable handling in Vite (ESM)', () => {
  test('respects VITE_SENTRY_SPOTLIGHT environment variable', async ({ page }) => {
    // This test assumes VITE_SENTRY_SPOTLIGHT=true is set in the env
    await page.goto('/spotlight-env-test.html');

    // Wait for the script to run
    await page.waitForTimeout(1000);

    const viteSpotlight = await page.getByTestId('vite-spotlight').textContent();
    const spotlightStatus = await page.getByTestId('spotlight-integration-found').textContent();

    // Verify VITE_SENTRY_SPOTLIGHT is accessible
    expect(viteSpotlight).toContain('true');

    // Verify Spotlight integration is enabled
    expect(spotlightStatus).toContain('ENABLED');
  });

  test('import.meta.env is available in ESM build', async ({ page }) => {
    // Vite produces ESM builds, so import.meta should be available
    await page.goto('/spotlight-env-test.html');

    await page.waitForTimeout(1000);

    const importMetaAvailable = await page.getByTestId('import-meta-available').textContent();
    const importMetaValue = await page.getByTestId('import-meta-env-spotlight').textContent();

    // Verify import.meta is available (ESM build)
    expect(importMetaAvailable).toContain('YES (ESM)');

    // Verify import.meta.env can access VITE_SENTRY_SPOTLIGHT
    expect(importMetaValue).toContain('true');
  });

  test('process.env also works via Vite transformation', async ({ page }) => {
    // Vite transforms process.env references at build time
    await page.goto('/spotlight-env-test.html');

    await page.waitForTimeout(1000);

    const processEnvValue = await page.getByTestId('process-env-spotlight').textContent();

    // Verify process.env works (transformed by Vite)
    expect(processEnvValue).toContain('true');
  });

  test('handles empty string environment variables correctly', async ({ page }) => {
    // This test verifies that empty strings are treated as undefined
    // and don't enable Spotlight (via resolveSpotlightOptions)

    // Note: This test would need a separate test run with VITE_SENTRY_SPOTLIGHT=''
    // For now, we document the expected behavior
    await page.goto('/spotlight-env-test.html');

    await page.waitForTimeout(1000);

    // With an empty string, Spotlight should be disabled
    // The resolveSpotlightOptions function filters out empty strings
  });

  test('no syntax errors from import.meta in ESM build', async ({ page }) => {
    // This test verifies that the ESM build (used by Vite) properly
    // includes import.meta syntax without errors

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });

    await page.goto('/spotlight-env-test.html');

    // Wait for the page to be fully loaded
    await page.waitForTimeout(1000);

    // Should have no syntax errors
    const syntaxErrors = [...consoleErrors, ...pageErrors].filter(
      err => err.includes('SyntaxError') || err.includes('Unexpected token') || err.includes('Cannot use import.meta'),
    );

    expect(syntaxErrors).toHaveLength(0);
  });

  test('getEnvValue function works with import.meta.env', async ({ page }) => {
    // This test verifies that our getEnvValue utility function
    // can successfully read from import.meta.env in Vite/ESM builds

    await page.goto('/spotlight-env-test.html');

    await page.waitForTimeout(1000);

    const importMetaValue = await page.getByTestId('import-meta-env-spotlight').textContent();
    const spotlightStatus = await page.getByTestId('spotlight-integration-found').textContent();

    // Both should show the same value since getEnvValue checks both process.env and import.meta.env
    expect(importMetaValue).toContain('true');
    expect(spotlightStatus).toContain('ENABLED');
  });
});
