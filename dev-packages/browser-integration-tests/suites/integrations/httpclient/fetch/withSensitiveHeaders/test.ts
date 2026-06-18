import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';

sentryTest(
  'should filter sensitive header and cookie values with sendDefaultPii',
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
          'X-Auth-Token': 'secret-response-token',
          'X-Request-Id': 'abc-123',
        },
      });
    });

    const req = await Promise.all([waitForErrorRequest(page), page.goto(url)]).then(([r]) => r);
    const eventData = envelopeRequestParser<Event>(req);

    expect(eventData.exception?.values).toHaveLength(1);

    const reqHeaders = eventData.request?.headers || {};
    const resHeaders = (eventData.contexts?.response?.headers as Record<string, string>) || {};

    // Non-sensitive request headers should be present with their values
    expect(reqHeaders['accept']).toBe('application/json');
    expect(reqHeaders['content-type']).toBe('application/json');
    expect(reqHeaders['x-custom-header']).toBe('safe-value');

    // Sensitive request headers should have their values filtered
    // 'authorization' matches the 'auth' snippet
    expect(reqHeaders['authorization']).toBe('[Filtered]');
    // 'x-api-key' matches the 'key' snippet
    expect(reqHeaders['x-api-key']).toBe('[Filtered]');

    // Non-sensitive response headers should be present with their values
    expect(resHeaders['x-request-id']).toBe('abc-123');

    // Sensitive response headers should have their values filtered
    // 'x-auth-token' matches 'auth' and 'token' snippets
    expect(resHeaders['x-auth-token']).toBe('[Filtered]');
  },
);
