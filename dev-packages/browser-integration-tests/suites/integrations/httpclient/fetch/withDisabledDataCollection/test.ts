import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';

sentryTest(
  'should not capture headers or cookies when dataCollection disables them',
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

    const req = await Promise.all([waitForErrorRequest(page), page.goto(url)]).then(([r]) => r);
    const eventData = envelopeRequestParser<Event>(req);

    expect(eventData.exception?.values).toHaveLength(1);
    expect(eventData.message).toBe('HTTP Client Error with status code: 500');

    // Request URL and method are always present
    expect(eventData.request?.url).toBe('http://sentry-test.io/foo');
    expect(eventData.request?.method).toBe('GET');

    // Request headers set in subject.js should not be captured
    expect(eventData.request?.headers?.accept).toBeUndefined();
    expect(eventData.request?.headers?.cache).toBeUndefined();
    expect(eventData.request?.headers?.['content-type']).toBeUndefined();
    expect(eventData.request?.cookies).toBeUndefined();

    // Response headers should not be captured
    expect(eventData.contexts?.response?.headers?.['content-type']).toBeUndefined();
    expect(eventData.contexts?.response?.cookies).toBeUndefined();
  },
);
