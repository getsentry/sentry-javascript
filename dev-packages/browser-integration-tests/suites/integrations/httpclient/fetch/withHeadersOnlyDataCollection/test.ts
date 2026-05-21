import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest(
  'should capture headers but not cookies when cookies are disabled in dataCollection',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('**/foo', route => {
      return route.fulfill({
        status: 500,
        body: JSON.stringify({
          error: {
            message: 'Internal Server Error',
          },
        }),
        headers: {
          'Content-Type': 'text/html',
        },
      });
    });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(eventData.exception?.values).toHaveLength(1);

    // Headers should be present
    expect(eventData.request?.headers).toMatchObject({
      accept: 'application/json',
      cache: 'no-cache',
      'content-type': 'application/json',
    });

    expect(eventData.contexts?.response?.headers).toMatchObject({
      'content-type': 'text/html',
    });

    // Cookies should not be present
    expect(eventData.request?.cookies).toBeUndefined();
    expect(eventData.contexts?.response?.cookies).toBeUndefined();
  },
);
