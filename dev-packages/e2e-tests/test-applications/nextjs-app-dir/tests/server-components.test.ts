import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

test('Sends a span for a request to app router', async ({ page }) => {
  const serverComponentSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return (
      span.name === 'GET /server-component/parameter/[...parameters]' &&
      span.is_segment &&
      String(span.attributes['http.target']?.value).startsWith('/server-component/parameter/1337/42')
    );
  });

  await page.goto('/server-component/parameter/1337/42');

  const span = await serverComponentSpanPromise;

  expect(span.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(span.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(span.status).toBe('ok');
  expect(span.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'http.method': { value: 'GET', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    'http.route': { value: '/server-component/parameter/[...parameters]', type: 'string' },
    'http.status_code': { value: 200, type: 'integer' },
    'http.target': { value: '/server-component/parameter/1337/42', type: 'string' },
    'sentry.kind': { value: 'server', type: 'string' },
    'next.route': { value: '/server-component/parameter/[...parameters]', type: 'string' },
  });
});

test('Should not set an error status on an app router span when it redirects', async ({ page }) => {
  const serverComponentSpanPromise = waitForStreamedSpan('nextjs-app-dir', span => {
    return span.name === 'GET /server-component/redirect' && span.is_segment;
  });

  await page.goto('/server-component/redirect');

  const span = await serverComponentSpanPromise;

  expect(span.status).toBe('ok');
});

test('Should set a "not_found" status on a server component span when notFound() is called and the request span should have status ok', async ({
  page,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-app-dir', 'GET /server-component/not-found');

  await page.goto('/server-component/not-found');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.name === 'GET /server-component/not-found' && span.is_segment)!;

  // Segment span should have status ok, because the http status is ok, but the render component span
  // should carry the not_found status.
  expect(segmentSpan.status).toBe('ok');
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'render route (app) /server-component/not-found',
      status: 'error',
      attributes: expect.objectContaining({
        'sentry.status.message': { value: 'not_found', type: 'string' },
      }),
    }),
  );

  // Page server component span should have the right name and attributes
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'resolve page server component "/server-component/not-found"',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'function', type: 'string' },
        'sentry.nextjs.ssr.function.type': { value: 'Page', type: 'string' },
        'sentry.nextjs.ssr.function.route': { value: '/server-component/not-found', type: 'string' },
      }),
    }),
  );
});

test('Should capture an error and spans for a app router page', async ({ page }) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-app-dir', 'GET /server-component/faulty');

  const errorEventPromise = waitForError('nextjs-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'I am a faulty server component';
  });

  await page.goto('/server-component/faulty');

  const spans = await spansPromise;
  const errorEvent = await errorEventPromise;
  const segmentSpan = spans.find(span => span.name === 'GET /server-component/faulty' && span.is_segment)!;

  // Error event should have the right transaction name
  expect(errorEvent.transaction).toBe(`Page Server Component (/server-component/faulty)`);

  // Segment span should have status ok, because the http status is ok, but the render component span
  // should be errored. Only the binary status is asserted: when a span is terminated by an exception
  // rather than an explicit status, `sentry.status.message` carries the error text, which differs per
  // Next.js version (React replaces it with a generic string in Next 15 production builds).
  expect(segmentSpan.status).toBe('ok');
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'render route (app) /server-component/faulty',
      status: 'error',
    }),
  );

  // The page server component span should have the right name and attributes
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'resolve page server component "/server-component/faulty"',
      attributes: expect.objectContaining({
        'sentry.op': { value: 'function', type: 'string' },
        'sentry.nextjs.ssr.function.type': { value: 'Page', type: 'string' },
        'sentry.nextjs.ssr.function.route': { value: '/server-component/faulty', type: 'string' },
      }),
    }),
  );

  // Assert that isolation scope works properly. Span v2 carries no scope tags, so this is only
  // asserted on the error event; the span-side assertions were dropped in the streaming port.
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

  // Modules are set for Next.js
  expect(errorEvent.modules).toEqual(
    expect.objectContaining({
      '@sentry/nextjs': expect.any(String),
      '@playwright/test': expect.any(String),
    }),
  );
});

test('Should not throw error on server component when importing shimmed feature flag function', async ({ page }) => {
  await page.goto('/server-component/featureFlag');
  // tests that none of the feature flag functions throw an error when imported in a node environment
  await expect(page.locator('body')).toContainText('FeatureFlagServerComponent');
});
