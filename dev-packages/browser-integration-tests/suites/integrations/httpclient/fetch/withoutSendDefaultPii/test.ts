import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest(
  'should not capture request/response headers or cookies without sendDefaultPii',
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
    expect(eventData.message).toBe('HTTP Client Error with status code: 500');

    // Request URL and method are always present
    expect(eventData.request?.url).toBe('http://sentry-test.io/foo');
    expect(eventData.request?.method).toBe('GET');

    // Without sendDefaultPii, no request headers should be captured by the integration
    expect(eventData.request?.headers?.accept).toBeUndefined();
    expect(eventData.request?.headers?.cache).toBeUndefined();
    expect(eventData.request?.headers?.['content-type']).toBeUndefined();
    expect(eventData.request?.cookies).toBeUndefined();

    // Response headers should not be captured either
    expect(eventData.contexts?.response?.headers?.['content-type']).toBeUndefined();
    expect(eventData.contexts?.response?.cookies).toBeUndefined();
  },
);
