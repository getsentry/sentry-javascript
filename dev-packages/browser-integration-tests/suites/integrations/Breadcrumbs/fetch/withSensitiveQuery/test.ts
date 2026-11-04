import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('filters sensitive query params in the fetch breadcrumb URL', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('**/foo?*', route => route.fulfill({ status: 200, body: '{}' }));

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.breadcrumbs).toEqual([
    {
      timestamp: expect.any(Number),
      category: 'fetch',
      type: 'http',
      data: {
        method: 'GET',
        status_code: 200,
        url: 'http://sentry-test.io/foo?token=[Filtered]&page=1',
      },
    },
  ]);
});
