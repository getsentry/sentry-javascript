import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

async function mockSupabaseRoute(page: Page) {
  await page.route('**/rest/v1/todos**', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        userNames: ['John', 'Jane'],
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

sentryTest('should capture Supabase database operation breadcrumbs', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  await mockSupabaseRoute(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.breadcrumbs).toBeDefined();
  expect(eventData.breadcrumbs).toContainEqual({
    timestamp: expect.any(Number),
    type: 'supabase',
    category: 'db.insert',
    message: 'insert(...) filter(columns, ) from(todos)',
    data: expect.objectContaining({
      query: expect.arrayContaining(['filter(columns, )']),
    }),
  });
});

sentryTest('should capture multiple Supabase operations in sequence', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  await mockSupabaseRoute(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  const events = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url });

  expect(events).toHaveLength(2);

  events.forEach(event => {
    expect(
      event.breadcrumbs?.some(breadcrumb => breadcrumb.type === 'supabase' && breadcrumb?.category?.startsWith('db.')),
    ).toBe(true);
  });
});

sentryTest('should include correct data payload in Supabase breadcrumbs', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    return;
  }

  await mockSupabaseRoute(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  const supabaseBreadcrumb = eventData.breadcrumbs?.find(b => b.type === 'supabase');

  expect(supabaseBreadcrumb).toBeDefined();
  expect(supabaseBreadcrumb?.data).toMatchObject({
    query: expect.arrayContaining(['filter(columns, )']),
  });
});
