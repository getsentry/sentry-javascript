import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest.beforeEach(({ browserName }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }
});

// `connection.rtt` is recorded as a measurement, which is only flushed on the pageload
// transaction. It must not leak onto navigation transactions.
sentryTest(
  'records `connection.rtt` as a measurement on pageload but not on navigation transactions',
  async ({ getLocalTestUrl, page }) => {
    const pageloadRequestPromise = waitForTransactionRequest(page, event => event.contexts?.trace?.op === 'pageload');
    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);

    const pageloadRequest = envelopeRequestParser(await pageloadRequestPromise) as Event;

    const navigationRequestPromise = waitForTransactionRequest(
      page,
      event => event.contexts?.trace?.op === 'navigation',
    );
    await page.goto(`${url}#foo`);

    const navigationRequest = envelopeRequestParser(await navigationRequestPromise) as Event;

    expect(pageloadRequest.contexts?.trace?.op).toBe('pageload');
    expect(navigationRequest.contexts?.trace?.op).toBe('navigation');

    expect(pageloadRequest.measurements?.['connection.rtt']?.value).toBeDefined();
    expect(navigationRequest.measurements?.['connection.rtt']).toBeUndefined();
  },
);
