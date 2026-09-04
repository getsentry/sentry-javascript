import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import {
  collectStreamedSpans,
  getSpanOp,
  waitForError,
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
  const spansPromise = collectStreamedSpans(
    APP_NAME,
    spans => spans.some(isSegmentNamed('POST action-formdata')) && spans.some(isDataFunction('action')),
  );

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
  const spansPromise = collectStreamedSpans(
    APP_NAME,
    spans => spans.some(isSegmentNamed('GET')) && spans.some(isDataFunction('loader')),
  );

  await page.goto('/');

  const spans = await spansPromise;
  const loaderSpan = spans.find(isDataFunction('loader'));

  expect(loaderSpan).toBeDefined();
  expect(getSpanOp(loaderSpan!)).toBe('function');
});

test('Propagates the trace when the ErrorBoundary is triggered', async ({ page }) => {
  // Streamed spans are buffered before they flush, so spans from an earlier page load can still be
  // arriving here.
  const streamedSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans(APP_NAME, spans => {
    streamedSpans.push(...spans);
    return false;
  });

  // The ErrorBoundary replaces the document, so there is no `sentry-trace` meta tag to read this
  // page load's trace off. A unique path identifies its server segment instead.
  const id = crypto.randomUUID();
  await page.goto(`/error-boundary-capture/${id}`);
  await expect(page.locator('#event-id')).not.toBeEmpty();

  const findServerSegmentSpan = () =>
    streamedSpans.find(
      span =>
        getSpanOp(span) === 'http.server' &&
        span.is_segment &&
        span.attributes['url.path']?.value === `/error-boundary-capture/${id}`,
    );
  await expect.poll(findServerSegmentSpan).toBeDefined();
  const serverSegmentSpan = findServerSegmentSpan()!;
  expect(serverSegmentSpan.name).toBe('GET error-boundary-capture/:id');

  // The client continues the server trace, so its pageload span hangs off the root loader span.
  const findPageloadSpan = () =>
    streamedSpans.find(
      span => getSpanOp(span) === 'pageload' && span.is_segment && span.trace_id === serverSegmentSpan.trace_id,
    );
  await expect.poll(findPageloadSpan).toBeDefined();
  const pageloadSpan = findPageloadSpan()!;
  expect(pageloadSpan.name).toBe('/error-boundary-capture/:id');
  expect(pageloadSpan.span_id).not.toBe(serverSegmentSpan.span_id);

  const loaderSpan = streamedSpans.find(span => span.span_id === pageloadSpan.parent_span_id);
  expect(loaderSpan).toBeDefined();
  expect(loaderSpan!.attributes['code.function.name']?.value).toBe('loader');
});

test('Parameterizes a 2-level nested route on the server', async ({ page }) => {
  const spansPromise = collectStreamedSpans(
    APP_NAME,
    spans => spans.some(isSegmentNamed('GET users/:userId/posts/:postId')) && spans.some(isDataFunction('loader')),
  );

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
  const spansPromise = collectStreamedSpans(
    APP_NAME,
    spans =>
      spans.some(isSegmentNamed('POST action-json-response/:id')) &&
      spans.some(isDataFunction('action', routeId)) &&
      spans.some(isDataFunction('loader', 'root')) &&
      spans.some(isDataFunction('loader', routeId)),
  );

  await request.post('/action-json-response/123123');

  const spans = await spansPromise;
  const actionSpan = spans.find(isDataFunction('action', routeId))!;

  expect(getSpanOp(actionSpan)).toBe('function');
  expect(actionSpan.attributes['match.params.id']?.value).toBe('123123');

  const segment = spans.find(isSegmentNamed('POST action-json-response/:id'))!;
  expect(segment.attributes['http.request.method']?.value).toBe('POST');
});

test('Records loader spans on a deferred loader response', async ({ page }) => {
  const routeId = 'routes/loader-defer-response.$id';
  const spansPromise = collectStreamedSpans(
    APP_NAME,
    spans =>
      spans.some(isSegmentNamed('GET loader-defer-response/:id')) && spans.some(isDataFunction('loader', routeId)),
  );

  await page.goto('/loader-defer-response/123123');

  const spans = await spansPromise;
  const segment = spans.find(isSegmentNamed('GET loader-defer-response/:id'))!;

  expect(segment.attributes['sentry.segment.name.source']?.value).toBe('route');
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

  const loaderSpan = streamedSpans.find(span => span.span_id === loaderSpanId)!;
  expect(loaderSpan.attributes['code.function.name']?.value).toBe('loader');
  expect(loaderSpan.parent_span_id).toBe(serverSegmentSpan.span_id);
});

test('Does not bleed scope tags between concurrent requests', async ({ request }) => {
  const eventPromises = [1, 2, 3, 4].map(i => waitForError(APP_NAME, event => event.message === `scope-bleed-${i}`));

  await Promise.all([
    request.get('/scope-bleed/1'),
    request.get('/scope-bleed/2'),
    request.get('/scope-bleed/3'),
    request.get('/scope-bleed/4'),
  ]);

  const events = await Promise.all(eventPromises);

  events.forEach(event => {
    const tags = event.tags ?? {};
    const customTags = Object.keys(tags).filter(t => t.startsWith('tag'));
    expect(customTags).toHaveLength(1);

    const key = customTags[0]!;
    const value = key[key.length - 1];
    expect(tags[key]).toBe(value);
    expect(event.message).toBe(`scope-bleed-${value}`);
  });
});
