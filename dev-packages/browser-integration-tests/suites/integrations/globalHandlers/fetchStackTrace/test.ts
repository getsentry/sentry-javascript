import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('should create errors with stack traces for failing fetch calls', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 3, { url, timeout: 10000 });
  const errorEvent = envelopes.find(event => !event.type)!;
  expect(errorEvent?.exception?.values?.[0].stacktrace?.frames?.length).toBeGreaterThan(0);
});
