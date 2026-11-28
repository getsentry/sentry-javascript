import { expect, test } from '@playwright/test';
import { collectStreamedSpans, waitForError } from '@sentry-internal/test-utils';

test('Captures an error thrown while a page renders', async ({ request }) => {
  const errorPromise = waitForError('vinext-cf-workers', event => {
    return event.exception?.values?.[0]?.value === 'Page render error from vinext';
  });
  // vinext's Workers Cache adapter renders the page in a second invocation, which has its own request span.
  const requestSpanCount = process.env.E2E_VINEXT_WORKERS_CACHE ? 2 : 1;
  const requestSpansPromise = collectStreamedSpans(
    'vinext-cf-workers',
    spans => spans.filter(span => span.is_segment && span.name === 'GET /page-error').length === requestSpanCount,
  );

  const response = await request.get('/page-error?token=secret-value-123');
  expect(response.status()).toBe(500);

  const errorEvent = await errorPromise;
  const requestSpans = (await requestSpansPromise).filter(span => span.is_segment);

  expect(errorEvent.sdk?.name).toBe('sentry.javascript.nextjs');
  expect(errorEvent.environment).toBe('qa');
  expect(errorEvent.transaction).toBe('GET /page-error');
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.function.nextjs.on_request_error',
  });
  expect(errorEvent.contexts?.trace?.trace_id).toBe(requestSpans[0]?.trace_id);

  // The second invocation's request carries vinext's internal data: the
  // `__vinext_cache_key` query param and `x-vinext-internal-*` headers, which
  // transport the original URL (including its token) unfiltered. None of it
  // may land in the recorded error event or request spans.
  expect(requestSpans).toHaveLength(requestSpanCount);
  for (const recorded of [errorEvent.request, ...requestSpans.map(span => span.attributes)]) {
    const serialized = JSON.stringify(recorded);
    expect(serialized).not.toContain('x-vinext-internal-');
    expect(serialized).not.toContain('__vinext_');
    expect(serialized).not.toContain('secret-value-123');
  }
});
