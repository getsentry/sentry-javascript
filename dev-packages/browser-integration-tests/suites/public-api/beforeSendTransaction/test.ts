import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { SEMANTIC_ATTRIBUTE_SENTRY_SOURCE } from '@sentry/browser';
import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest(
  'allows modification of the transaction name and source but overwrites source to custom',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(eventData.type).toBe('transaction');

    // user-changed name
    expect(eventData.transaction).toBe('customName');

    // Despite the user setting the source to 'route', the SDK detects that the txn name was changed
    // and therefore sets the source to 'custom'. This is not ideal but also not easily changeable.
    // Given that Relay doesn't differentiate between 'source' and 'route', we'll keep this as-is for now.
    expect(eventData.transaction_info?.source).toBe('custom');
    expect(eventData.contexts?.trace?.data?.[SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]).toBe('custom');
  },
);
