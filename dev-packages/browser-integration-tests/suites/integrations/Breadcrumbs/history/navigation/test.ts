import { expect } from '@playwright/test';
import type { Event } from '@sentry/browser';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('should record history changes as navigation breadcrumbs', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.breadcrumbs).toEqual([
    {
      category: 'navigation',
      data: {
        from: '/index.html',
        to: '/foo',
      },
      timestamp: expect.any(Number),
    },
    {
      category: 'navigation',
      data: {
        from: '/foo',
        to: '/bar?a=1#fragment',
      },
      timestamp: expect.any(Number),
    },
    {
      category: 'navigation',
      data: {
        from: '/bar?a=1#fragment',
        to: '[object Object]',
      },
      timestamp: expect.any(Number),
    },
    {
      category: 'navigation',
      data: {
        from: '[object Object]',
        to: '/bar?a=1#fragment',
      },
      timestamp: expect.any(Number),
    },
  ]);
});
