import { expect, test } from '@playwright/test';
import { waitForStreamedSpan } from '@sentry-internal/test-utils';

// There is no instrumentation yet. This app exists so later pull requests add instrumentation and its
// tests together, rather than also introducing a new CI surface.
test('the app boots under the Sentry --import entry', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#home')).toBeVisible();
});

test('Sentry.init from the v3 subpath reports a server span', async ({ baseURL }) => {
  // Names are still URL based. This only proves the subpath resolves and the SDK is live.
  const spanPromise = waitForStreamedSpan('remix-v3', span => span.is_segment === true);

  await fetch(`${baseURL}/`);

  const span = await spanPromise;
  expect(span.attributes?.['http.request.method']?.value).toBe('GET');
});
