import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest(
  'should capture recorded transactions as breadcrumbs for the following event sent',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const events = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url });

    const errorEvent = events.find(event => event.exception?.values?.[0].value === 'test_simple_breadcrumb_error')!;

    expect(errorEvent.breadcrumbs).toHaveLength(1);
    expect(errorEvent.breadcrumbs?.[0]).toMatchObject({
      category: 'sentry.transaction',
      message: expect.any(String),
    });
  },
);
