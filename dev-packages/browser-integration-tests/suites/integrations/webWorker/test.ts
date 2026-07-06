import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../utils/helpers';

sentryTest('Assigns web worker debug IDs when using webWorkerIntegration', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE;
  if (bundle != null && !bundle.includes('esm') && !bundle.includes('cjs')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  // `init.js` creates the worker at page load, so the route must be registered before navigating.
  await page.route('**/worker.js', route => {
    return route.fulfill({
      path: `${__dirname}/assets/worker.js`,
    });
  });

  const errorEventPromise = waitForErrorRequest(
    page,
    event => !!event.exception?.values?.[0]?.value?.includes('Worker error for testing'),
  );

  await page.goto(url);

  await page.locator('#errWorker').click();

  const errorEvent = envelopeRequestParser<Event>(await errorEventPromise);

  expect(errorEvent.debug_meta?.images).toBeDefined();

  const debugImages = errorEvent.debug_meta?.images || [];

  expect(debugImages.length).toBe(1);

  debugImages.forEach(image => {
    expect(image.type).toBe('sourcemap');
    expect(image.debug_id).toEqual('worker-debug-id-789');
    expect(image.code_file).toEqual('http://sentry-test.io/worker.js');
  });
});

sentryTest('Captures unhandled rejections from web workers', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE;
  if (bundle != null && !bundle.includes('esm') && !bundle.includes('cjs')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  // `init.js` creates the worker at page load, so the route must be registered before navigating.
  await page.route('**/worker.js', route => {
    return route.fulfill({
      path: `${__dirname}/assets/worker.js`,
    });
  });

  const errorEventPromise = waitForErrorRequest(
    page,
    event => !!event.exception?.values?.[0]?.value?.includes('Worker unhandled rejection'),
  );

  await page.goto(url);

  await page.locator('#rejectionWorker').click();

  const errorEvent = envelopeRequestParser<Event>(await errorEventPromise);

  expect(errorEvent.exception?.values?.[0]?.value).toContain('Worker unhandled rejection');
  expect(errorEvent.exception?.values?.[0]?.mechanism?.type).toBe('auto.browser.web_worker.onunhandledrejection');
  expect(errorEvent.exception?.values?.[0]?.mechanism?.handled).toBe(false);
  expect(errorEvent.contexts?.worker).toBeDefined();
  expect(errorEvent.contexts?.worker?.filename).toContain('worker.js');
});
