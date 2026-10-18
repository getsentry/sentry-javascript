import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

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
    sentryTest.skip();
  }

  await mockSupabaseRoute(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventPromise = waitForErrorRequest(page, event => event.exception?.values?.[0]?.value === 'Test Error');
  await page.goto(url);
  const eventData = envelopeRequestParser(await eventPromise);

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
    sentryTest.skip();
  }

  await mockSupabaseRoute(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventPromise = waitForErrorRequest(page, event => event.exception?.values?.[0]?.value === 'Test Error');
  await page.goto(url);
  const event = envelopeRequestParser(await eventPromise);
  const supabaseBreadcrumbs = event.breadcrumbs?.filter(breadcrumb => breadcrumb.type === 'supabase');
  expect(supabaseBreadcrumbs?.map(breadcrumb => breadcrumb.category)).toEqual(['db.insert', 'db.select']);
});

sentryTest('should include correct data payload in Supabase breadcrumbs', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await mockSupabaseRoute(page);

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventPromise = waitForErrorRequest(page, event => event.exception?.values?.[0]?.value === 'Test Error');
  await page.goto(url);
  const eventData = envelopeRequestParser(await eventPromise);

  const supabaseBreadcrumb = eventData.breadcrumbs?.find(b => b.type === 'supabase');

  expect(supabaseBreadcrumb).toBeDefined();
  expect(supabaseBreadcrumb?.data).toMatchObject({
    query: expect.arrayContaining(['filter(columns, )']),
  });
});
