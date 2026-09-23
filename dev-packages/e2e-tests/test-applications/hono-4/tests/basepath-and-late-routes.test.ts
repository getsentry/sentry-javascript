import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

test.describe('basePath with sub-app routes', () => {
  test('traces GET on a sub-app mounted via .basePath().route()', async ({ baseURL }) => {
    const segmentPromise = waitForStreamedSpan(
      APP_NAME,
      segment =>
        segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-basepath/v1/users',
    );

    const response = await fetch(`${baseURL}/test-basepath/v1/users`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ users: [{ id: 1, name: 'Alice' }] });

    const segment = await segmentPromise;
    expect(segment.name).toBe('GET /test-basepath/v1/users');
    expect(getSpanOp(segment)).toBe('http.server');
  });

  test('traces parameterized route under .basePath().route()', async ({ baseURL }) => {
    const segmentPromise = waitForStreamedSpan(
      APP_NAME,
      segment =>
        segment.is_segment &&
        getSpanOp(segment) === 'http.server' &&
        segment.name === 'GET /test-basepath/v1/users/:userId',
    );

    const response = await fetch(`${baseURL}/test-basepath/v1/users/42`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ userId: '42' });

    const segment = await segmentPromise;
    expect(segment.name).toBe('GET /test-basepath/v1/users/:userId');
    expect(getSpanOp(segment)).toBe('http.server');
  });
});

// TODO: this test is currently skipped because we do not yet support middleware registered on new instances (e.g. here via .basePath(..).use(...)).
test.skip('.basePath() middleware instrumentation', () => {
  test('creates middleware span for .use() on .basePath() clone', async ({ baseURL }) => {
    const segmentPromise = collectStreamedSpansUntilSegment(
      APP_NAME,
      segment => getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-basepath-mw/hello',
    );

    const response = await fetch(`${baseURL}/test-basepath-mw/hello`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ greeting: 'world' });

    const segmentSpans = await segmentPromise;
    const segment = segmentSpans.find(
      segment =>
        segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-basepath-mw/hello',
    )!;
    expect(segment.name).toBe('GET /test-basepath-mw/hello');

    const spans = segmentSpans.filter(
      span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
    );
    const middlewareSpan = spans.find(span => getSpanOp(span) === 'middleware' && span.name === 'basepathMiddleware');

    expect(middlewareSpan).toBeDefined();
    expect(middlewareSpan?.attributes['sentry.origin']?.value).toBe('auto.middleware.hono');
  });
});

test('traces .get() route registered after .basePath()/.route() chains', async ({ baseURL }) => {
  const segmentPromise = waitForStreamedSpan(
    APP_NAME,
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /test-late-get',
  );

  const response = await fetch(`${baseURL}/test-late-get`);
  expect(response.status).toBe(200);

  const body = await response.json();
  expect(body).toEqual({ registered: 'after-chains' });

  const segment = await segmentPromise;
  expect(segment.name).toBe('GET /test-late-get');
  expect(getSpanOp(segment)).toBe('http.server');
});
