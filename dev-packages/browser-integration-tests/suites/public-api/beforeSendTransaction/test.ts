import { expect } from '@playwright/test';
import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/browser';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../utils/helpers';

sentryTest(
  'allows modification of the transaction name and source but overwrites source to custom',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(eventData.type).toBe('transaction');

    // user-changed name
    expect(eventData.transaction).toBe('customName');

    // Despite the user setting the source to 'route', the SDK detects that the txn name was changed
    // and therefore sets the transaction_info.source to 'custom'. This is not ideal but also not easily changeable.
    // Given that Relay doesn't differentiate between 'source' and 'route', we'll keep this as-is for now.
    expect(eventData.transaction_info?.source).toBe('custom');

    // This stays the same but it has no effect on Relay.
    expect(eventData.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('route');
  },
);
