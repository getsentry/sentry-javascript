import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';

sentryTest('captures safe request and response headers by default', async ({ getLocalTestUrl, page }) => {
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
        'X-Auth-Token': 'secret-response-token',
        'X-Request-Id': 'req-123',
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

  expect(eventData.request?.headers?.accept).toBe('application/json');
  expect(eventData.request?.headers?.cache).toBe('no-cache');
  expect(eventData.request?.headers?.['content-type']).toBe('application/json');
  expect(eventData.request?.headers?.authorization).toBe('[Filtered]');
  expect(eventData.request?.headers?.['x-api-key']).toBe('[Filtered]');
  expect(eventData.request?.cookies).toBeUndefined();

  expect(eventData.contexts?.response?.headers?.['content-type']).toBe('text/html');
  expect(eventData.contexts?.response?.headers?.['x-request-id']).toBe('req-123');
  expect(eventData.contexts?.response?.headers?.['x-auth-token']).toBe('[Filtered]');
  expect(eventData.contexts?.response?.cookies).toBeUndefined();
});
