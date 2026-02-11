import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../../utils/helpers';

sentryTest('should create spans for fetch requests called directly after init', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const req = await waitForTransactionRequestOnUrl(page, url);
  const tracingEvent = envelopeRequestParser(req);

  const requestSpans = tracingEvent.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(1);

  expect(requestSpans![0]).toMatchObject({
    description: 'GET http://sentry-test-site.example/0',
    parent_span_id: tracingEvent.contexts?.trace?.span_id,
    span_id: expect.stringMatching(/[a-f\d]{16}/),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: tracingEvent.contexts?.trace?.trace_id,
    data: {
      'http.method': 'GET',
      'http.url': 'http://sentry-test-site.example/0',
      url: 'http://sentry-test-site.example/0',
      'server.address': 'sentry-test-site.example',
      type: 'fetch',
    },
  });
});
