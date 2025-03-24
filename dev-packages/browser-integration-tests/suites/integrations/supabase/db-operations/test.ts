import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

describe('Supabase Integration', () => {
  sentryTest('should capture Supabase database operation breadcrumbs', async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(eventData.breadcrumbs).toBeDefined();
    expect(eventData.breadcrumbs).toContainEqual({
      timestamp: expect.any(Number),
      type: 'supabase',
      category: 'db.insert',
      message: 'from(todos)',
      data: expect.any(Object),
    });
  });

  sentryTest('should capture multiple Supabase operations in sequence', async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const events = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url });

    expect(events).toHaveLength(2);

    events.forEach(event => {
      expect(
        event.breadcrumbs?.some(
          breadcrumb => breadcrumb.type === 'supabase' && breadcrumb?.category?.startsWith('db.'),
        ),
      ).toBe(true);
    });
  });

  sentryTest('should include correct data payload in Supabase breadcrumbs', async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    const supaBreadcrumb = eventData.breadcrumbs?.find(b => b.type === 'supabase');

    expect(supaBreadcrumb).toBeDefined();
    expect(supaBreadcrumb?.data).toMatchObject({
      table: expect.any(String),
      operation: expect.any(String),
      timestamp: expect.any(Number),
    });
  });
});
