import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

async function mockSupabaseAuthRoutes(page: Page) {
  await page.route('**/auth/v1/token?grant_type=password**', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  await page.route('**/auth/v1/logout**', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        message: 'Logged out',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
}

sentryTest('should capture Supabase authentication spans', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  await mockSupabaseAuthRoutes(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const supabaseSpans = eventData.spans?.filter(({ op }) => op?.startsWith('db.supabase.auth'));

  expect(supabaseSpans).toHaveLength(2);
  expect(supabaseSpans![0]).toMatchObject({
    description: 'signInWithPassword',
    parent_span_id: eventData.contexts?.trace?.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: eventData.contexts?.trace?.trace_id,
    status: 'ok',
    data: expect.objectContaining({
      'sentry.op': 'db.supabase.auth.signInWithPassword',
      'sentry.origin': 'auto.db.supabase',
    }),
  });

  expect(supabaseSpans![1]).toMatchObject({
    description: 'signOut',
    parent_span_id: eventData.contexts?.trace?.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: eventData.contexts?.trace?.trace_id,
    status: 'ok',
    data: expect.objectContaining({
      'sentry.op': 'db.supabase.auth.signOut',
      'sentry.origin': 'auto.db.supabase',
    }),
  });
});
