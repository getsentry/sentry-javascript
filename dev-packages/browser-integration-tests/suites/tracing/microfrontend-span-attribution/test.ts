import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest('should attribute spans to their originating microfrontend', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: '{}' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spans = collectStreamedSpans(page);
  const rootSpanPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
  await page.goto(url);
  await rootSpanPromise;
  await page.evaluate(() => (window as any).Sentry.flush());
  const httpSpans = spans.filter(span => getSpanOp(span) === 'http.client');
  expect(httpSpans).toHaveLength(4);

  // Each MFE's fetch is attributed via withScope + spanStart hook
  expect(
    httpSpans.find(s => s.attributes['url.full']?.value?.toString().includes('/api/todos/1'))?.attributes['mfe.name'],
  ).toEqual({ type: 'string', value: 'mfe-header' });
  expect(
    httpSpans.find(s => s.attributes['url.full']?.value?.toString().includes('/api/todos/2'))?.attributes['mfe.name'],
  ).toEqual({ type: 'string', value: 'mfe-one' });
  expect(
    httpSpans.find(s => s.attributes['url.full']?.value?.toString().includes('/api/todos/3'))?.attributes['mfe.name'],
  ).toEqual({ type: 'string', value: 'mfe-two' });

  // Shell span has no MFE tag
  expect(
    httpSpans.find(s => s.attributes['url.full']?.value?.toString().includes('/api/shell-config'))?.attributes[
      'mfe.name'
    ],
  ).toBeUndefined();
});
