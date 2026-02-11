import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../../utils/helpers';

sentryTest('sanitizes data URLs in fetch span name and attributes', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const req = await waitForTransactionRequestOnUrl(page, url);
  const transactionEvent = envelopeRequestParser(req);

  const requestSpans = transactionEvent.spans?.filter(({ op }) => op === 'http.client');

  expect(requestSpans).toHaveLength(1);

  const span = requestSpans?.[0];

  const sanitizedUrl = 'data:text/plain,base64,SGVsbG8gV2... [truncated]';
  expect(span?.description).toBe(`GET ${sanitizedUrl}`);

  expect(span?.data).toMatchObject({
    'http.method': 'GET',
    url: sanitizedUrl,
    type: 'fetch',
  });

  expect(span?.data?.['http.url']).toBe(sanitizedUrl);
});
