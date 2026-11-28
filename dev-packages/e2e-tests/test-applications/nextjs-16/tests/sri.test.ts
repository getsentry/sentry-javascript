import { expect, test } from '@playwright/test';
import { findSubresourceIntegrityMismatches } from '@sentry-internal/test-utils';
import * as fs from 'fs';
import * as path from 'path';
import { isVinext } from './isVinext';

const isDevMode = !!process.env.TEST_ENV && process.env.TEST_ENV.includes('development');

test.describe('Subresource Integrity (SRI)', () => {
  test('page with client components loads correctly with SRI enabled', async ({ page }) => {
    // SRI is only relevant for production builds
    test.skip(isDevMode, 'SRI only applies to production builds');

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/sri-test');

    const heading = page.locator('#sri-test-heading');
    await expect(heading).toBeVisible();

    // Verify client-side interactivity works (scripts loaded correctly)
    const button = page.locator('#counter-button');
    await expect(button).toContainText('Count: 0');
    await button.click();
    await expect(button).toContainText('Count: 1');

    expect(consoleErrors.filter(e => e.includes('integrity'))).toHaveLength(0);
  });

  test('client-side navigation works with SRI enabled', async ({ page }) => {
    test.skip(isDevMode, 'SRI only applies to production builds');

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/sri-test');
    await expect(page.locator('#sri-test-heading')).toBeVisible();

    // Navigate to target page via client-side link
    await page.locator('#navigate-link').click();
    await expect(page.locator('#sri-target-heading')).toBeVisible();

    // Verify client-side interactivity on the target page
    const targetButton = page.locator('#target-button');
    await expect(targetButton).toContainText('Click me');
    await targetButton.click();
    await expect(targetButton).toContainText('Clicked!');

    // Navigate back
    await page.locator('#back-link').click();
    await expect(page.locator('#sri-test-heading')).toBeVisible();

    expect(consoleErrors.filter(e => e.includes('integrity'))).toHaveLength(0);
  });

  test('integrity hashes match the client files after the Sentry build steps', () => {
    test.skip(isDevMode || isVinext, 'Checks the Next.js production build output');

    const nextDir = path.join(process.cwd(), '.next');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(nextDir, 'server', 'subresource-integrity-manifest.json'), 'utf8'),
    ) as Record<string, string>;
    // Next.js hashes `_ssgManifest.js` before it writes the final file, also without Sentry.
    const integrities = Object.fromEntries(
      Object.entries(manifest).filter(([file]) => /\.(js|css)$/.test(file) && !file.endsWith('/_ssgManifest.js')),
    );

    expect(Object.keys(integrities).length).toBeGreaterThan(0);
    expect(findSubresourceIntegrityMismatches(nextDir, integrities)).toEqual([]);
    expect(
      Object.keys(integrities).some(file =>
        /\/\/# debugId=|sentry-dbid-/.test(fs.readFileSync(path.join(nextDir, file), 'utf8')),
      ),
    ).toBe(true);
  });
});
