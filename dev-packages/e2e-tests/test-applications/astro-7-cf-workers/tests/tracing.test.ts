import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'astro-7-cf-workers';

test('sends server and client pageload spans with the same trace id', async ({ page }) => {
  const clientPageloadSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return getSpanOp(span) === 'pageload' && span.is_segment && span.name === '/test-ssr';
  });
  const serverPageRequestSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return getSpanOp(span) === 'http.server' && span.is_segment && span.name === 'GET /test-ssr';
  });

  await page.goto('/test-ssr');

  const clientPageloadSpan = await clientPageloadSpanPromise;
  const serverPageRequestSpan = await serverPageRequestSpanPromise;

  expect(clientPageloadSpan.trace_id).toEqual(serverPageRequestSpan.trace_id);
  expect(clientPageloadSpan.parent_span_id).toEqual(serverPageRequestSpan.span_id);
  expect(serverPageRequestSpan.parent_span_id).toBeUndefined();

  expect(clientPageloadSpan.attributes).toMatchObject({
    'sentry.op': { value: 'pageload', type: 'string' },
    'sentry.origin': { value: 'auto.pageload.astro', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.sdk.name': { value: 'sentry.javascript.astro', type: 'string' },
    'url.template': { value: '/test-ssr', type: 'string' },
  });

  expect(serverPageRequestSpan.status).toBe('ok');
  expect(serverPageRequestSpan.attributes).toMatchObject({
    'http.response.status_code': { value: 200, type: 'integer' },
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.astro', type: 'string' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'sentry.sdk.name': { value: 'sentry.javascript.cloudflare', type: 'string' },
    'url.full': { value: expect.stringContaining('/test-ssr'), type: 'string' },
  });
});
