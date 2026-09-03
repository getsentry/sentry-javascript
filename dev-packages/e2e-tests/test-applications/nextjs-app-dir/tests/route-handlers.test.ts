import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Should create a span for route handlers', async ({ request }) => {
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === 'GET /route-handlers/[param]' && span.is_segment;
  });

  const response = await request.get('/route-handlers/foo', { headers: { 'x-yeet': 'test-value' } });
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('ok');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
  expect(routehandlerSpan.attributes['http.request.header.x_yeet']?.value).toBe('test-value');
});

test('Should create a span for route handlers and correctly set span status depending on http status', async ({
  request,
}) => {
  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === 'POST /route-handlers/[param]' && span.is_segment;
  });

  const response = await request.post('/route-handlers/bar');
  expect(await response.json()).toStrictEqual({ name: 'John Doe' });

  const routehandlerSpan = await routehandlerSpanPromise;

  expect(routehandlerSpan.status).toBe('error');
  expect(routehandlerSpan.attributes['sentry.status.message']?.value).toBe('invalid_argument');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
});

test('Should record exceptions and spans for faulty route handlers', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'route-handler-error';
  });

  const routehandlerSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === 'PUT /route-handlers/[param]/error' && span.is_segment;
  });

  await request.put('/route-handlers/baz/error').catch(() => {
    // noop
  });

  const routehandlerSpan = await routehandlerSpanPromise;
  const routehandlerError = await errorEventPromise;

  // Assert that isolation scope works properly. Span v2 carries no scope tags, so this is only
  // asserted on the error event; the span-side assertions were dropped in the streaming port.
  expect(routehandlerError.tags?.['my-isolated-tag']).toBe(true);
  expect(routehandlerError.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

  expect(routehandlerSpan.status).toBe('error');
  expect(getSpanOp(routehandlerSpan)).toBe('http.server');
  expect(String(routehandlerSpan.attributes['sentry.origin']?.value)).toContain('auto');

  expect(routehandlerError.exception?.values?.[0].value).toBe('route-handler-error');

  expect(routehandlerError.request?.method).toBe('PUT');
  expect(routehandlerError.request?.url).toContain('/route-handlers/baz/error');

  expect(routehandlerError.transaction).toBe('PUT /route-handlers/[param]/error');
});

test.describe('Edge runtime', () => {
  test('should create a span for route handlers', async ({ request }) => {
    const routehandlerSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
      return span.name === 'PATCH /route-handlers/[param]/edge' && span.is_segment;
    });

    const response = await request.patch('/route-handlers/bar/edge');
    expect(await response.json()).toStrictEqual({ name: 'John Doe' });

    const routehandlerSpan = await routehandlerSpanPromise;

    expect(routehandlerSpan.status).toBe('error');
    expect(routehandlerSpan.attributes['sentry.status.message']?.value).toBe('unauthenticated');
    expect(getSpanOp(routehandlerSpan)).toBe('http.server');
  });

  test('should record exceptions and spans for faulty route handlers', async ({ request }) => {
    const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
      return (
        errorEvent?.exception?.values?.[0]?.value === 'route-handler-edge-error' &&
        errorEvent.contexts?.runtime?.name === 'vercel-edge'
      );
    });

    const routehandlerSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
      return span.name === 'DELETE /route-handlers/[param]/edge' && span.is_segment;
    });

    await request.delete('/route-handlers/baz/edge').catch(() => {
      // noop
    });

    const routehandlerSpan = await routehandlerSpanPromise;
    const routehandlerError = await errorEventPromise;

    // Assert that isolation scope works properly. Span v2 carries no scope tags, so this is only
    // asserted on the error event; the span-side assertions were dropped in the streaming port.
    expect(routehandlerError.tags?.['my-isolated-tag']).toBe(true);
    expect(routehandlerError.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

    expect(routehandlerSpan.status).toBe('error');
    expect(getSpanOp(routehandlerSpan)).toBe('http.server');

    expect(routehandlerError.exception?.values?.[0].value).toBe('route-handler-edge-error');

    expect(routehandlerError.transaction).toBe('DELETE /route-handlers/[param]/edge');
  });
});

test('should not crash route handlers that are configured with `export const dynamic = "error"`', async ({
  request,
}) => {
  const response = await request.get('/route-handlers/static');
  expect(await response.json()).toStrictEqual({ result: 'static response' });
});
