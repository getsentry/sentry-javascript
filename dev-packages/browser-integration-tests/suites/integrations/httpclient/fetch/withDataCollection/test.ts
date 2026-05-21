import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest(
  'should capture request and response headers when using dataCollection options',
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

    expect(eventData).toMatchObject({
      message: 'HTTP Client Error with status code: 500',
      request: {
        url: 'http://sentry-test.io/foo',
        method: 'GET',
        headers: {
          accept: 'application/json',
          cache: 'no-cache',
          'content-type': 'application/json',
        },
      },
      contexts: {
        response: {
          status_code: 500,
          headers: {
            'content-type': 'text/html',
          },
        },
      },
    });
  },
);
