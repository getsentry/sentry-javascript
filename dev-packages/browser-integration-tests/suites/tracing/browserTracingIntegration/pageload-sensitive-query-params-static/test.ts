import { BROWSER_REQUEST, PAGELOAD, RESOURCE_IMG } from '@sentry/conventions/op';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'filters sensitive query params in the pageload transaction URL and span descriptions',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    await page.route('https://sentry-test-site.example/path/to/image.svg?*', route =>
      route.fulfill({ body: '<svg xmlns="http://www.w3.org/2000/svg"/>', contentType: 'image/svg+xml' }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === PAGELOAD);
    await page.goto(`${url}?jwt=sensitive-jwt-value&page=1`, { referer: `${url}?jwt=sensitive-jwt-value&page=2` });
    const eventData = envelopeRequestParser<Event>(await pageloadRequestPromise);

    expect(eventData.request?.url).toBe(`${url}?jwt=[Filtered]&page=1`);
    expect(eventData.request?.headers?.Referer).toBe(`${url}?jwt=[Filtered]&page=2`);
    expect(eventData.spans?.find(({ op }) => op === BROWSER_REQUEST)?.description).toBe(`${url}?jwt=[Filtered]&page=1`);
    expect(eventData.spans?.find(({ op }) => op === RESOURCE_IMG)?.description).toBe(
      'https://sentry-test-site.example/path/to/image.svg?token=[Filtered]&size=2',
    );

    const serializedEvent = JSON.stringify(eventData);
    expect(serializedEvent).not.toContain('sensitive-jwt-value');
    expect(serializedEvent).not.toContain('sensitive-token-value');
  },
);
