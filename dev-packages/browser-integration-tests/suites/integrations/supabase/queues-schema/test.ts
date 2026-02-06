import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

async function mockSupabaseRoute(page: Page) {
  await page.route('**/rpc/send', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify([0]),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  await page.route('**/rpc/pop', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify([
        {
          msg_id: 0,
        },
      ]),
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

sentryTest('should capture Supabase queue spans from client.schema(...).rpc', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  await mockSupabaseRoute(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  const event = await getFirstSentryEnvelopeRequest<Event>(page, url);

  const queueSpans = event.spans?.filter(({ op }) => op?.startsWith('queue.'));

  expect(queueSpans).toHaveLength(2);

  expect(queueSpans![0]).toMatchObject({
    description: 'publish todos',
    parent_span_id: event.contexts?.trace?.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: event.contexts?.trace?.trace_id,
    data: expect.objectContaining({
      'sentry.op': 'queue.publish',
      'sentry.origin': 'auto.db.supabase.queue.producer',
      'messaging.destination.name': 'todos',
      'messaging.message.id': '0',
    }),
  });

  expect(queueSpans![1]).toMatchObject({
    description: 'process todos',
    parent_span_id: event.contexts?.trace?.span_id,
    span_id: expect.any(String),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    trace_id: event.contexts?.trace?.trace_id,
    data: expect.objectContaining({
      'sentry.op': 'queue.process',
      'sentry.origin': 'auto.db.supabase.queue.consumer',
      'messaging.destination.name': 'todos',
      'messaging.message.id': '0',
    }),
  });
});
