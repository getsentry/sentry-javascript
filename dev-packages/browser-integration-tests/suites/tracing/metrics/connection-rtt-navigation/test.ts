import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

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
    const url = await getLocalTestUrl({ testDir: __dirname });

    const pageloadRequest = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const navigationRequest = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

    expect(pageloadRequest.contexts?.trace?.op).toBe('pageload');
    expect(navigationRequest.contexts?.trace?.op).toBe('navigation');

    expect(pageloadRequest.measurements?.['connection.rtt']?.value).toBeDefined();
    expect(navigationRequest.measurements?.['connection.rtt']).toBeUndefined();
  },
);
