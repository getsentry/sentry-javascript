import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('works with a Request passed in', async ({ getLocalTestUrl, page }) => {
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
            type: 'http.client',
            handled: false,
          },
        },
      ],
    },
    request: {
      url: 'http://sentry-test.io/foo',
      method: 'POST',
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
});
