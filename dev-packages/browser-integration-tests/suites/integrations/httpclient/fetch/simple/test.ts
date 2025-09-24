import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

// This test rarely flakes with timeouts. The reason might be:
// https://github.com/microsoft/playwright/issues/10376
sentryTest(
  'should assign request and response context from a failed 500 fetch request',
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

    // Not able to get the cookies from the request/response because of Playwright bug
    // https://github.com/microsoft/playwright/issues/11035
    expect(eventData).toMatchObject({
      message: 'HTTP Client Error with status code: 500',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'HTTP Client Error with status code: 500',
            mechanism: {
              type: 'auto.http.client.fetch',
              handled: false,
            },
            stacktrace: {
              frames: expect.arrayContaining([
                expect.objectContaining({
                  filename: 'http://sentry-test.io/subject.bundle.js',
                  function: '?',
                  in_app: true,
                }),
              ]),
            },
          },
        ],
      },
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
          body_size: 45,
          headers: {
            'content-type': 'text/html',
            'content-length': '45',
          },
        },
      },
    });
  },
);
