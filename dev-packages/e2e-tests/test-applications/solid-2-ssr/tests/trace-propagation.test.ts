import { expect, test } from '@playwright/test';
import { URL_PATH } from '@sentry/conventions/attributes';
import { HTTP_SERVER, PAGELOAD } from '@sentry/conventions/op';
import { getRuntime, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('continues the server trace in the pageload', async ({ page }) => {
  // On Cloudflare, nothing sends the trace to the browser yet: `addServerTimingTraceHeader` only covers Node.
  test.skip(getRuntime() === 'cloudflare', 'No trace propagation to the browser on Cloudflare yet');

  // Other tests request `/user/:id` too, so both spans are matched on a path no other test uses.
  const path = `/user/trace-${Date.now()}`;

  const serverSpanPromise = waitForStreamedSpan('solid-2-ssr', span => {
    return getSpanOp(span) === HTTP_SERVER && span.is_segment && span.attributes?.[URL_PATH]?.value === path;
  });
  const pageloadSpanPromise = waitForStreamedSpan('solid-2-ssr', span => {
    return getSpanOp(span) === PAGELOAD && span.is_segment && span.attributes?.[URL_PATH]?.value === path;
  });

  await page.goto(path);

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);

  expect(pageloadSpan.trace_id).toBe(serverSpan.trace_id);
  expect(pageloadSpan.parent_span_id).toBe(serverSpan.span_id);
});
