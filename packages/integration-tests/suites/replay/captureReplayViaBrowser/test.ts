import { expect } from '@playwright/test';
import { SDK_VERSION } from '@sentry/browser';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('captureReplay', async ({ getLocalTestPath, page }) => {
  // For this test, we skip all bundle tests, as we're only interested in Replay being correctly
  // exported from the `@sentry/browser` npm package.
  if (process.env.PW_BUNDLE && process.env.PW_BUNDLE.startsWith('bundle_')) {
    sentryTest.skip();
  }

  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });
  await page.goto(url);
  await page.waitForRequest('https://dsn.ingest.sentry.io/**/*');

  await page.click('button');
  await page.waitForRequest('https://dsn.ingest.sentry.io/**/*');

  const replayEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(replayEvent).toBeDefined();
  expect(replayEvent).toEqual({
    type: 'replay_event',
    timestamp: expect.any(Number),
    error_ids: [],
    trace_ids: [],
    urls: [expect.stringContaining('/dist/index.html')],
    replay_id: expect.stringMatching(/\w{32}/),
    segment_id: 2,
    replay_type: 'session',
    event_id: expect.stringMatching(/\w{32}/),
    environment: 'production',
    sdk: {
      integrations: [
        'InboundFilters',
        'FunctionToString',
        'TryCatch',
        'Breadcrumbs',
        'GlobalHandlers',
        'LinkedErrors',
        'Dedupe',
        'HttpContext',
        'Replay',
      ],
      version: SDK_VERSION,
      name: 'sentry.javascript.browser',
    },
    sdkProcessingMetadata: {},
    request: {
      url: expect.stringContaining('/dist/index.html'),
      headers: {
        'User-Agent': expect.stringContaining(''),
      },
    },
    platform: 'javascript',
    tags: { sessionSampleRate: 1, errorSampleRate: 0 },
  });
});
