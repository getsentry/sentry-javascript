import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

async function mockSupabaseRoute(page: Page) {
  await page.route('**/rpc/my_custom_function', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({ result: 'success' }),
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

sentryTest(
  'should capture exactly one db span for generic RPC calls (no double instrumentation)',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      return;
    }

    await mockSupabaseRoute(page);

    const url = await getLocalTestUrl({ testDir: __dirname });

    const event = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const dbSpans = event.spans?.filter(({ op }) => op === 'db');

    // Should have exactly one db span (not doubled by PostgREST instrumentation)
    expect(dbSpans).toHaveLength(1);

    expect(dbSpans![0]).toMatchObject({
      description: 'rpc(my_custom_function)',
      parent_span_id: event.contexts?.trace?.span_id,
      span_id: expect.any(String),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      trace_id: event.contexts?.trace?.trace_id,
      data: expect.objectContaining({
        'sentry.op': 'db',
        'sentry.origin': 'auto.db.supabase',
        'db.system': 'postgresql',
        'db.operation': 'rpc',
        'db.params': { param1: 'value1' },
      }),
    });
  },
);
