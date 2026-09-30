import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { collectStreamedSpans, getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('sanitizes data URLs in fetch span name and attributes', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const spans = collectStreamedSpans(page);
  const pageloadPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');
  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);
  const pageload = await pageloadPromise;
  await page.evaluate(() => (window as any).Sentry.flush());

  const requests = spans.filter(span => getSpanOp(span) === 'http.client');
  expect(requests).toHaveLength(1);
  const span = requests[0];
  expect(span.name).toBe('GET');
  expect(span.parent_span_id).toBe(pageload.span_id);
  expect(span.trace_id).toBe(pageload.trace_id);
  expect(span.attributes['http.request.method']).toEqual({ type: 'string', value: 'GET' });
  expect(span.attributes.type).toEqual({ type: 'string', value: 'fetch' });
  expect(span.attributes['url.full']).toEqual({
    type: 'string',
    value: 'data:text/plain,base64,SGVsbG8gV2... [truncated]',
  });
});
