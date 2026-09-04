import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import {
  collectStreamedSpansUntilSegment,
  getSpanOp,
  waitForStreamedSpan,
  waitForStreamedSpans,
} from '@sentry-internal/test-utils';

const APP_NAME = 'create-remix-app-express';

test.describe.configure({ mode: 'serial' });

function isSegmentNamed(name: string): (span: SerializedStreamedSpan) => boolean {
  return span => getSpanOp(span) === 'http.server' && span.is_segment && span.name === name;
}

function isDataFunction(name: 'action' | 'loader', routeId?: string): (span: SerializedStreamedSpan) => boolean {
  return span =>
    span.attributes['code.function.name']?.value === name &&
    (routeId === undefined || span.attributes['match.route.id']?.value === routeId);
}

test('Sends a parameterized span name to Sentry', async ({ page }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, isSegmentNamed('GET user/:id'));

  await page.goto('/user/123');

  const span = await spanPromise;

  expect(span.attributes['http.route']?.value).toBe('user/:id');
});

test('Sends form data with the action span', async ({ page }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'POST action-formdata');

  await page.goto('/action-formdata');

  await page.fill('input[name=text]', 'test');
  await page.setInputFiles('input[type=file]', {
    name: 'file.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is test'),
  });

  await page.locator('button[type=submit]').click();

  const spans = await spansPromise;
  const actionSpan = spans.find(isDataFunction('action'));

  expect(actionSpan).toBeDefined();
  expect(getSpanOp(actionSpan!)).toBe('function');
  expect(actionSpan!.attributes).toMatchObject({
    'remix.action_form_data.text': { value: 'test', type: 'string' },
    'remix.action_form_data.file': { value: 'file.txt', type: 'string' },
  });
});

test('Sends a loader span to Sentry', async ({ page }) => {
  // The index route has no path of its own, so the segment is named after the method alone; its
  // `url.path` is what tells this request apart.
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    span => getSpanOp(span) === 'http.server' && span.attributes['url.path']?.value === '/',
  );

  await page.goto('/');

  const spans = await spansPromise;
  const loaderSpan = spans.find(isDataFunction('loader'));

  expect(loaderSpan).toBeDefined();
  expect(getSpanOp(loaderSpan!)).toBe('function');
});

test('Propagates the trace when the ErrorBoundary is triggered', async ({ page }) => {
  // The ErrorBoundary replaces the document, so there is no `sentry-trace` meta tag to read this
  // page load's trace off. A unique path identifies all three of its spans instead, which lets each
  // one be awaited on its own rather than selected out of an accumulated trace.
  const path = `/error-boundary-capture/${crypto.randomUUID()}`;
  const hasPath = (span: SerializedStreamedSpan): boolean => span.attributes['url.path']?.value === path;

  const serverSegmentSpanPromise = waitForStreamedSpan(
    APP_NAME,
    span => getSpanOp(span) === 'http.server' && span.is_segment && hasPath(span),
  );
  // Remix renders the document from inside the root loader, so that is the span the client
  // continues the trace from.
  const loaderSpanPromise = waitForStreamedSpan(
    APP_NAME,
    span => isDataFunction('loader', 'root')(span) && hasPath(span),
  );
  const pageloadSpanPromise = waitForStreamedSpan(
    APP_NAME,
    span => getSpanOp(span) === 'pageload' && span.is_segment && hasPath(span),
  );

  await page.goto(path);
  await expect(page.locator('#event-id')).not.toBeEmpty();

  const serverSegmentSpan = await serverSegmentSpanPromise;
  const loaderSpan = await loaderSpanPromise;
  const pageloadSpan = await pageloadSpanPromise;

  expect(serverSegmentSpan.name).toBe('GET error-boundary-capture/:id');
  expect(pageloadSpan.name).toBe('/error-boundary-capture/:id');

  // The client continues the server trace, so its pageload span hangs off the root loader span.
  expect(loaderSpan.parent_span_id).toBe(serverSegmentSpan.span_id);
  expect(pageloadSpan.parent_span_id).toBe(loaderSpan.span_id);
  expect(pageloadSpan.trace_id).toBe(serverSegmentSpan.trace_id);
  expect(pageloadSpan.span_id).not.toBe(serverSegmentSpan.span_id);
});

test('Parameterizes a 2-level nested route on the server', async ({ page }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET users/:userId/posts/:postId');

  await page.goto('/users/user123/posts/post456');

  const spans = await spansPromise;
  const segment = spans.find(isSegmentNamed('GET users/:userId/posts/:postId'))!;

  expect(segment.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(spans.some(span => isDataFunction('loader')(span) && getSpanOp(span) === 'function')).toBe(true);
});

test('Parameterizes a 3-level nested API route on the server', async ({ page }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, isSegmentNamed('GET api/v1/data/:id'));

  await page.goto('/api/v1/data/abc123');

  const span = await spanPromise;

  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Parameterizes a deeply nested route on the server', async ({ page }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, isSegmentNamed('GET deeply/:nested/:structure/:id'));

  await page.goto('/deeply/level1/level2/level3');

  const span = await spanPromise;

  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Parameterizes a flat dot-notation route on the server', async ({ page }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, isSegmentNamed('GET products/:productId/reviews/:reviewId'));

  await page.goto('/products/prod789/reviews/rev101');

  const span = await spanPromise;

  expect(span.attributes['sentry.segment.name.source']?.value).toBe('route');
});

test('Records action and loader spans on a parameterized action route', async ({ request }) => {
  const routeId = 'routes/action-json-response.$id';
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'POST action-json-response/:id');

  await request.post('/action-json-response/123123');

  const spans = await spansPromise;
  const actionSpan = spans.find(isDataFunction('action', routeId))!;

  expect(actionSpan).toBeDefined();
  expect(getSpanOp(actionSpan)).toBe('function');
  expect(actionSpan.attributes['match.params.id']?.value).toBe('123123');

  expect(spans.some(isDataFunction('loader', 'root'))).toBe(true);
  expect(spans.some(isDataFunction('loader', routeId))).toBe(true);

  const segment = spans.find(isSegmentNamed('POST action-json-response/:id'))!;
  expect(segment.attributes['http.request.method']?.value).toBe('POST');
});

test('Records loader spans on a deferred loader response', async ({ page }) => {
  const routeId = 'routes/loader-defer-response.$id';
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET loader-defer-response/:id');

  await page.goto('/loader-defer-response/123123');

  const spans = await spansPromise;
  const segment = spans.find(isSegmentNamed('GET loader-defer-response/:id'))!;

  expect(segment.attributes['sentry.segment.name.source']?.value).toBe('route');
  expect(spans.some(isDataFunction('loader', routeId))).toBe(true);
});

test('Continues a trace from incoming sentry-trace and baggage headers', async ({ request }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.trace_id === '12312012123120121231201212312012' && span.is_segment;
  });

  await request.get('/loader-json-response/3', {
    headers: {
      'sentry-trace': '12312012123120121231201212312012-1121201211212012-1',
      baggage: 'sentry-version=1.0,sentry-environment=production,sentry-trace_id=12312012123120121231201212312012',
    },
  });

  const span = await spanPromise;

  expect(span.parent_span_id).toBe('1121201211212012');
});

test('Sends two linked spans (server & client) to Sentry', async ({ page }) => {
  const streamedSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans(APP_NAME, spans => {
    streamedSpans.push(...spans);
    return false;
  });

  await page.goto('/');

  const sentryTrace = await page.getAttribute('meta[name="sentry-trace"]', 'content');
  const [traceId, loaderSpanId] = (sentryTrace ?? '').split('-');
  expect(traceId).toMatch(/^[a-f0-9]{32}$/);
  expect(loaderSpanId).toMatch(/^[a-f0-9]{16}$/);

  const findPageloadSpan = () =>
    streamedSpans.find(
      span => getSpanOp(span) === 'pageload' && span.is_segment && span.parent_span_id === loaderSpanId,
    );
  await expect.poll(findPageloadSpan).toBeDefined();
  expect(findPageloadSpan()!.trace_id).toBe(traceId);
  expect(findPageloadSpan()!.name).toBe('/');

  const findServerSegmentSpan = () =>
    streamedSpans.find(span => getSpanOp(span) === 'http.server' && span.is_segment && span.trace_id === traceId);
  await expect.poll(findServerSegmentSpan).toBeDefined();
  const serverSegmentSpan = findServerSegmentSpan()!;

  // The index route has no path of its own, so the segment keeps the low-cardinality method-only
  // name it starts with and never gets an `http.route`.
  expect(serverSegmentSpan.name).toBe('GET');
  expect(serverSegmentSpan.attributes['http.route']).toBeUndefined();
  expect(findPageloadSpan()!.span_id).not.toBe(serverSegmentSpan.span_id);

  const findLoaderSpan = () => streamedSpans.find(span => span.span_id === loaderSpanId);
  await expect.poll(findLoaderSpan).toBeDefined();
  expect(findLoaderSpan()!.attributes['code.function.name']?.value).toBe('loader');
  expect(findLoaderSpan()!.parent_span_id).toBe(serverSegmentSpan.span_id);
});

test('Does not bleed scope attributes between concurrent requests', async ({ request }) => {
  const spanPromises = [1, 2, 3, 4].map(i =>
    waitForStreamedSpan(
      APP_NAME,
      span => isSegmentNamed('GET scope-bleed/:id')(span) && span.attributes[`tag${i}`]?.value === String(i),
    ),
  );

  await Promise.all([
    request.get('/scope-bleed/1'),
    request.get('/scope-bleed/2'),
    request.get('/scope-bleed/3'),
    request.get('/scope-bleed/4'),
  ]);

  const spans = await Promise.all(spanPromises);

  spans.forEach(span => {
    const customKeys = Object.keys(span.attributes).filter(key => key.startsWith('tag'));
    expect(customKeys).toHaveLength(1);

    const key = customKeys[0]!;
    expect(span.attributes[key]?.value).toBe(key[key.length - 1]);
  });
});
