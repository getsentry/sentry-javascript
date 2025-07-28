import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('Assigns web worker debug IDs when using webWorkerIntegration', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE as string | undefined;
  if (bundle != null && !bundle.includes('esm') && !bundle.includes('cjs')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const errorEventPromise = getFirstSentryEnvelopeRequest<Event>(page, url);

  page.route('**/worker.js', route => {
    route.fulfill({
      path: `${__dirname}/assets/worker.js`,
    });
  });

  const button = page.locator('#errWorker');
  await button.click();

  const errorEvent = await errorEventPromise;

  expect(errorEvent.debug_meta?.images).toBeDefined();

  const debugImages = errorEvent.debug_meta?.images || [];

  expect(debugImages.length).toBe(1);

  debugImages.forEach(image => {
    expect(image.type).toBe('sourcemap');
    expect(image.debug_id).toEqual('worker-debug-id-789');
    expect(image.code_file).toEqual('http://sentry-test.io/worker.js');
  });
});
