import { expect } from '@playwright/test';
import type { Event } from '@sentry/browser';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('filters sensitive query params in navigation breadcrumbs', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.breadcrumbs).toEqual([
    {
      category: 'navigation',
      data: {
        from: '/index.html',
        to: '/foo?jwt=[Filtered]&a=1',
      },
      timestamp: expect.any(Number),
    },
    {
      category: 'navigation',
      data: {
        from: '/foo?jwt=[Filtered]&a=1',
        to: '/bar',
      },
      timestamp: expect.any(Number),
    },
  ]);
});
