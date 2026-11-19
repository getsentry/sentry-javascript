import { expect, test } from '@playwright/test';
import {
  collectStreamedSpansUntilSegment,
  getRuntime,
  getSpanOp,
  waitForError,
  waitForStreamedSpan,
} from '@sentry-internal/test-utils';
import { isTurbopackDevMode } from './isDevMode';
import { isVinext } from './isVinext';

// Next.js emits these spans itself. The SDK attaches no op, description or function name to
// them, so asserting `undefined` pins that they stay untouched.
const nextjsSpan = { op: undefined, description: undefined, codeFunctionName: undefined };

test('Sends a span for a request to app router with URL', async ({ page }) => {
  test.skip(isTurbopackDevMode, 'Turbopack intermittently returns 404 for nested dynamic routes in dev mode');
  test.skip(getRuntime() === 'cloudflare', 'On Workers the segment is the request span of `withSentry`');

  const spansPromise = collectStreamedSpansUntilSegment(
    'nextjs-16',
    span =>
      span.name === 'GET /parameterized/[one]/beep/[two]' &&
      String(span.attributes['http.target']?.value).startsWith('/parameterized/1337/beep/42'),
  );

  await page.goto('/parameterized/1337/beep/42');

  const spans = await spansPromise;
  const segmentSpan = spans.find(
    span =>
      span.name === 'GET /parameterized/[one]/beep/[two]' &&
      span.is_segment &&
      String(span.attributes['http.target']?.value).startsWith('/parameterized/1337/beep/42'),
  )!;

  expect(segmentSpan.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(segmentSpan.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(segmentSpan.status).toBe('ok');
  expect(segmentSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'http.method': { value: 'GET', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    'http.route': { value: '/parameterized/[one]/beep/[two]', type: 'string' },
    'http.status_code': { value: 200, type: 'integer' },
    'http.target': { value: '/parameterized/1337/beep/42', type: 'string' },
    'sentry.kind': { value: 'server', type: 'string' },
    'next.route': { value: '/parameterized/[one]/beep/[two]', type: 'string' },
  });

  // No child span should share the segment span's name
  expect(spans.filter(span => !span.is_segment && span.name === segmentSpan.name)).toHaveLength(0);
  expect(spans.filter(span => getSpanOp(span) === 'http.server')).toEqual([segmentSpan]);
});

// `withSentry` from `@sentry/nextjs/cloudflare` wraps the Worker entry, so the segment is its `http.server` span with
// the attributes of `@sentry/cloudflare`, named after the route Next.js resolved.
test('Sends the request span of the Worker for a request to app router with URL', async ({ page }) => {
  test.skip(getRuntime() !== 'cloudflare', 'Only on Workers the request span of `withSentry` is the segment');

  const spansPromise = collectStreamedSpansUntilSegment(
    'nextjs-16',
    span =>
      span.name === 'GET /parameterized/[one]/beep/[two]' &&
      span.attributes['url.path']?.value === '/parameterized/1337/beep/42',
  );

  await page.goto('/parameterized/1337/beep/42');

  const spans = await spansPromise;
  const segmentSpan = spans.find(
    span =>
      span.name === 'GET /parameterized/[one]/beep/[two]' &&
      span.is_segment &&
      span.attributes['url.path']?.value === '/parameterized/1337/beep/42',
  )!;

  expect(segmentSpan.span_id).toEqual(expect.stringMatching(/[a-f0-9]{16}/));
  expect(segmentSpan.trace_id).toEqual(expect.stringMatching(/[a-f0-9]{32}/));
  expect(segmentSpan.status).toBe('ok');
  expect(segmentSpan.attributes).toMatchObject({
    'sentry.op': { value: 'http.server', type: 'string' },
    'sentry.origin': { value: 'auto.http.cloudflare', type: 'string' },
    'sentry.sample_rate': { value: 1, type: 'integer' },
    'sentry.segment.name.source': { value: 'route', type: 'string' },
    'http.request.method': { value: 'GET', type: 'string' },
    'http.response.status_code': { value: 200, type: 'integer' },
    'http.route': { value: '/parameterized/[one]/beep/[two]', type: 'string' },
    'url.path': { value: '/parameterized/1337/beep/42', type: 'string' },
    'next.route': { value: '/parameterized/[one]/beep/[two]', type: 'string' },
  });

  // No child span should share the segment span's name
  expect(spans.filter(span => !span.is_segment && span.name === segmentSpan.name)).toHaveLength(0);
  expect(spans.filter(span => getSpanOp(span) === 'http.server')).toEqual([segmentSpan]);
});

test('Will create spans for every server component and metadata generation functions when visiting a page', async ({
  page,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'GET /nested-layout');

  await page.goto('/nested-layout');

  const fullSpans = await spansPromise;
  const spans = fullSpans.map(span => ({
    name: span.name,
    op: getSpanOp(span),
    description: span.attributes['sentry.description']?.value,
    codeFunctionName: span.attributes['code.function.name']?.value,
  }));

  expect(spans).toContainEqual({ ...nextjsSpan, name: 'render route (app) /nested-layout' });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'build component tree' });
  // Server component spans: the name is the low-cardinality `code.function.name`, and the
  // segment each one resolved for is on the description.
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve root layout server component',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve layout server component "(nested-layout)"',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve layout server component "nested-layout"',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Page',
    op: 'function',
    description: 'resolve page server component "/nested-layout"',
    codeFunctionName: 'Page',
  });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'generateMetadata /(nested-layout)/nested-layout/page' });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'start response' });
});

test('Will create spans for every server component and metadata generation functions when visiting a dynamic page', async ({
  page,
}) => {
  test.skip(isTurbopackDevMode, 'Turbopack intermittently returns 404 for dynamic routes in dev mode');

  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'GET /nested-layout/[dynamic]');

  await page.goto('/nested-layout/123');

  const fullSpans = await spansPromise;
  const spans = fullSpans.map(span => ({
    name: span.name,
    op: getSpanOp(span),
    description: span.attributes['sentry.description']?.value,
    codeFunctionName: span.attributes['code.function.name']?.value,
  }));

  expect(spans).toContainEqual({ ...nextjsSpan, name: 'resolve page components' });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'render route (app) /nested-layout/[dynamic]' });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'build component tree' });
  // Server component spans: the name is the low-cardinality `code.function.name`, and the
  // segment each one resolved for is on the description.
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve root layout server component',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve layout server component "(nested-layout)"',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve layout server component "nested-layout"',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Layout',
    op: 'function',
    description: 'resolve layout server component "[dynamic]"',
    codeFunctionName: 'Layout',
  });
  expect(spans).toContainEqual({
    name: 'Page',
    op: 'function',
    description: 'resolve page server component "/nested-layout/[dynamic]"',
    codeFunctionName: 'Page',
  });
  expect(spans).toContainEqual({
    ...nextjsSpan,
    name: 'generateMetadata /(nested-layout)/nested-layout/[dynamic]/page',
  });
  expect(spans).toContainEqual({ ...nextjsSpan, name: 'start response' });
});

test('Should not set an error status on an app router span when it redirects', async ({ page }) => {
  const serverComponentSpanPromise = waitForStreamedSpan('nextjs-16', span => {
    return span.name === 'GET /server-component/redirect' && span.is_segment;
  });

  await page.goto('/server-component/redirect');

  const span = await serverComponentSpanPromise;

  expect(span.status).toBe('ok');
});

// The SDK wraps server components only in webpack builds. Turbopack builds report errors through `onRequestError`
// alone, so their server component spans are the ones of Next.js.
const PAGE_SPAN_ATTRIBUTES = (route: string) => ({
  'sentry.op': { value: 'function', type: 'string' },
  'sentry.description': { value: `resolve page server component "${route}"`, type: 'string' },
  'code.function.name': { value: 'Page', type: 'string' },
  'sentry.nextjs.ssr.function.type': { value: 'Page', type: 'string' },
  'sentry.nextjs.ssr.function.route': { value: route, type: 'string' },
  'http.route': { value: route, type: 'string' },
});

test('Should set a "not_found" status on the request span when a server component calls notFound()', async ({
  page,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'GET /server-component/not-found');

  await page.goto('/server-component/not-found');

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.name === 'GET /server-component/not-found' && span.is_segment)!;

  expect(segmentSpan.status).toBe('error');
  expect(segmentSpan.attributes).toMatchObject({
    'sentry.status.message': { value: 'not_found', type: 'string' },
    'http.response.status_code': { value: 404, type: 'integer' },
  });

  // vinext builds with neither webpack nor Turbopack.
  if (!segmentSpan.attributes['turbopack'] && !isVinext) {
    expect(spans).toContainEqual(
      expect.objectContaining({
        name: 'render route (app) /server-component/not-found',
        status: 'error',
        attributes: expect.objectContaining({
          'sentry.status.message': { value: 'not_found', type: 'string' },
        }),
      }),
    );
    expect(spans).toContainEqual(
      expect.objectContaining({
        name: 'Page',
        attributes: expect.objectContaining(PAGE_SPAN_ATTRIBUTES('/server-component/not-found')),
      }),
    );
  }
});

test('Should capture an error and spans for a app router page', async ({ page }) => {
  const spansPromise = collectStreamedSpansUntilSegment('nextjs-16', 'GET /server-component/faulty');

  const errorEventPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'I am a faulty server component';
  });

  await page.goto('/server-component/faulty');

  const spans = await spansPromise;
  const errorEvent = await errorEventPromise;

  // Only the binary status is asserted: when a span is terminated by an exception rather than an explicit status,
  // `sentry.status.message` carries the error text, which React replaces with a generic string in production builds.
  expect(spans).toContainEqual(
    expect.objectContaining({
      name: 'render route (app) /server-component/faulty',
      status: 'error',
    }),
  );

  if (errorEvent.tags?.turbopack || isVinext) {
    expect(errorEvent.transaction).toBe('GET /server-component/faulty');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.function.nextjs.on_request_error',
    });
  } else {
    expect(errorEvent.transaction).toBe('Page Server Component (/server-component/faulty)');
    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
      handled: false,
      type: 'auto.function.nextjs.server_component',
    });
    expect(spans).toContainEqual(
      expect.objectContaining({
        name: 'Page',
        attributes: expect.objectContaining(PAGE_SPAN_ATTRIBUTES('/server-component/faulty')),
      }),
    );
  }

  // Span v2 carries no scope tags, so isolation is only asserted on the error event
  expect(errorEvent.tags?.['my-isolated-tag']).toBe(true);
  expect(errorEvent.tags?.['my-global-scope-isolated-tag']).not.toBeDefined();

  // `@sentry/cloudflare` has no modules integration
  if (getRuntime() !== 'cloudflare') {
    expect(errorEvent.modules).toEqual(
      expect.objectContaining({
        '@sentry/nextjs': expect.any(String),
        '@playwright/test': expect.any(String),
      }),
    );
  }
});

test('Should not throw error on server component when importing shimmed feature flag function', async ({ page }) => {
  await page.goto('/server-component/featureFlag');
  // tests that none of the feature flag functions throw an error when imported in a node environment
  await expect(page.locator('body')).toContainText('FeatureFlagServerComponent');
});
