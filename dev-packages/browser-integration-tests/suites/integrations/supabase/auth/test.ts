import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

async function mockSupabaseAuthRoutesSuccess(page: Page) {
  await page.route(/\/auth\/v1\/token\?grant_type=password/, route => {
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

async function mockSupabaseAuthRoutesFailure(page: Page) {
  await page.route(/\/auth\/v1\/token\?grant_type=password/, route => {
    return route.fulfill({
      status: 400,
      body: JSON.stringify({
        error_description: 'Invalid email or password',
        error: 'invalid_grant',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  await page.route('**/auth/v1/logout**', route => {
    return route.fulfill({
      status: 400,
      body: JSON.stringify({
        error_description: 'Invalid refresh token',
        error: 'invalid_grant',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
}

const bundle = process.env.PW_BUNDLE || '';
// We only want to run this in non-CDN bundle mode
if (bundle.startsWith('bundle')) {
  sentryTest.skip();
}

sentryTest('should capture Supabase authentication spans', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  await mockSupabaseAuthRoutesSuccess(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const supabaseSpans = eventData.spans?.filter(({ op }) => op?.startsWith('db'));

  expect(supabaseSpans).toHaveLength(2);
  expect(supabaseSpans![0]).toMatchObject({
    description: 'auth signInWithPassword',
    op: 'db',
    parent_span_id: eventData.contexts?.trace?.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: eventData.contexts?.trace?.trace_id,
    status: 'ok',
    data: expect.objectContaining({
      'sentry.op': 'db',
      'sentry.origin': 'auto.db.supabase',
      'db.operation': 'auth.signInWithPassword',
      'db.system': 'postgresql',
    }),
  });

  expect(supabaseSpans![1]).toMatchObject({
    description: 'auth signOut',
    op: 'db',
    parent_span_id: eventData.contexts?.trace?.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: eventData.contexts?.trace?.trace_id,
    status: 'ok',
    data: expect.objectContaining({
      'sentry.op': 'db',
      'sentry.origin': 'auto.db.supabase',
      'db.operation': 'auth.signOut',
      'db.system': 'postgresql',
    }),
  });
});

sentryTest('should capture Supabase authentication errors', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  await mockSupabaseAuthRoutesFailure(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  const [errorEvent, transactionEvent] = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url });

  const supabaseSpans = transactionEvent.spans?.filter(({ op }) => op?.startsWith('db'));

  expect(errorEvent.exception?.values?.[0].value).toBe('Invalid email or password');

  expect(supabaseSpans).toHaveLength(2);
  expect(supabaseSpans![0]).toMatchObject({
    description: 'auth signInWithPassword',
    op: 'db',
    parent_span_id: transactionEvent.contexts?.trace?.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: transactionEvent.contexts?.trace?.trace_id,
    status: 'internal_error',
    data: expect.objectContaining({
      'sentry.op': 'db',
      'sentry.origin': 'auto.db.supabase',
      'db.operation': 'auth.signInWithPassword',
      'db.system': 'postgresql',
    }),
  });
});
