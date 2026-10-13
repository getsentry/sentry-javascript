import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should create a span for edge routes', async ({ request }) => {
  // The route is only served by the edge runtime, so the span name identifies it on its own. The
  // transaction-based test additionally matched on `contexts.runtime.name`, which span v2 does not carry.
  const edgerouteSpanPromise = waitForStreamedSpan('nextjs-pages-dir', span => {
    return span.name === 'GET /api/edge-endpoint' && span.is_segment;
  });

  const response = await request.get('/api/edge-endpoint', {
    headers: {
      'x-yeet': 'test-value',
    },
  });
  expect(await response.json()).toStrictEqual({ name: 'Jim Halpert' });

  const edgerouteSpan = await edgerouteSpanPromise;

  expect(edgerouteSpan.status).toBe('ok');
  expect(getSpanOp(edgerouteSpan)).toBe('http.server');
  // The `x-yeet` request header is not asserted here: the edge runtime emits this segment span without
  // request headers, and they land on a sibling Node-side span in a separate trace.
});

test('Faulty edge routes', async ({ request }) => {
  const edgerouteSpanPromise = waitForStreamedSpan('nextjs-pages-dir', span => {
    return span.name === 'GET /api/error-edge-endpoint' && span.is_segment;
  });

  const errorEventPromise = waitForError('nextjs-pages-dir', errorEvent => {
    return (
      errorEvent?.exception?.values?.[0]?.value === 'Edge Route Error' &&
      errorEvent.contexts?.runtime?.name === 'vercel-edge'
    );
  });

  request.get('/api/error-edge-endpoint').catch(() => {
    // Noop
  });

  const [edgerouteSpan, errorEvent] = await Promise.all([
    test.step('should create a span', () => edgerouteSpanPromise),
    test.step('should create an error event', () => errorEventPromise),
  ]);

  test.step('should create spans with the right fields', () => {
    expect(edgerouteSpan.status).toBe('error');
    expect(getSpanOp(edgerouteSpan)).toBe('http.server');
  });

  test.step('should have scope isolation', () => {
    // Span v2 carries no scope tags, so isolation is only asserted on the error event; the span-side
    // assertions were dropped in the streaming port.
    expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
    expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();
  });
});
