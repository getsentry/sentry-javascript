import { expect, test } from '@playwright/test';
import { waitForStreamedSpan, getSpanOp, collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

const PREFIX = '/test-routes';

const REGISTRATION_STYLES = [
  { name: 'direct method', path: '' },
  { name: '.all()', path: '/all' },
  { name: '.on()', path: '/on' },
] as const;

test.describe('HTTP methods', () => {
  ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].forEach(method => {
    test(`sends transaction for ${method}`, async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && segment.name === `${method} ${PREFIX}`,
      );

      const response = await fetch(`${baseURL}${PREFIX}`, { method });
      expect(response.status).toBe(200);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === `${method} ${PREFIX}`,
      )!;
      expect(segment.name).toBe(`${method} ${PREFIX}`);
      expect(getSpanOp(segment)).toBe('http.server');
      expect(segment.attributes?.['sentry.segment.name.source']?.value).toBe('route');

      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );
      const middlewareSpans = spans.filter(s => getSpanOp(s) === 'middleware');
      expect(middlewareSpans).toEqual([]);
    });
  });
});

test.describe('route registration styles', () => {
  REGISTRATION_STYLES.forEach(({ name, path }) => {
    test(`${name} sends transaction with route source`, async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && segment.name === `GET ${PREFIX}${path}`,
      );

      const response = await fetch(`${baseURL}${PREFIX}${path}`);
      expect(response.status).toBe(200);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === `GET ${PREFIX}${path}`,
      )!;
      expect(segment.name).toBe(`GET ${PREFIX}${path}`);
      expect(getSpanOp(segment)).toBe('http.server');
      expect(segment.attributes?.['sentry.segment.name.source']?.value).toBe('route');

      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );
      const middlewareSpans = spans.filter(s => getSpanOp(s) === 'middleware');
      expect(middlewareSpans).toEqual([]);
    });
  });

  [
    { name: '.all()', path: '/all' },
    { name: '.on()', path: '/on' },
  ].forEach(({ name, path }) => {
    test(`${name} responds to POST`, async ({ baseURL }) => {
      const segmentPromise = collectStreamedSpansUntilSegment(
        APP_NAME,
        segment => getSpanOp(segment) === 'http.server' && segment.name === `POST ${PREFIX}${path}`,
      );

      const response = await fetch(`${baseURL}${PREFIX}${path}`, { method: 'POST' });
      expect(response.status).toBe(200);

      const segmentSpans = await segmentPromise;
      const segment = segmentSpans.find(
        segment =>
          segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === `POST ${PREFIX}${path}`,
      )!;
      expect(segment.name).toBe(`POST ${PREFIX}${path}`);
      expect(segment.attributes?.['sentry.segment.name.source']?.value).toBe('route');

      const spans = segmentSpans.filter(
        span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
      );
      const middlewareSpans = spans.filter(s => getSpanOp(s) === 'middleware');
      expect(middlewareSpans).toEqual([]);
    });
  });
});

test.describe('request data extraction', () => {
  test('includes method, url, and headers on span', async ({ baseURL }) => {
    const segmentPromise = waitForStreamedSpan(
      APP_NAME,
      segment =>
        segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === `GET ${PREFIX}/request-data`,
    );

    const response = await fetch(`${baseURL}${PREFIX}/request-data`);
    expect(response.status).toBe(200);

    const segment = await segmentPromise;
    expect(segment.attributes['http.request.method']?.value).toBe('GET');
    expect(segment.attributes['url.full']?.value).toContain(PREFIX);
    expect(segment.attributes['http.request.header.host']).toBeDefined();
  });

  test('includes query_string when present', async ({ baseURL }) => {
    const segmentPromise = waitForStreamedSpan(
      APP_NAME,
      segment =>
        segment.is_segment &&
        getSpanOp(segment) === 'http.server' &&
        segment.name === `GET ${PREFIX}/query-test` &&
        segment.attributes['url.query']?.value === 'foo=bar&baz=42',
    );

    const response = await fetch(`${baseURL}${PREFIX}/query-test?foo=bar&baz=42`);
    expect(response.status).toBe(200);

    const segment = await segmentPromise;

    expect(segment.attributes['http.request.method']?.value).toBe('GET');
    expect(segment.attributes['url.full']?.value).toContain(`${PREFIX}/query-test`);
    expect(segment.attributes['url.query']?.value).toBe('foo=bar&baz=42');
  });

  test('includes request data for POST with headers', async ({ baseURL }) => {
    const segmentPromise = waitForStreamedSpan(
      APP_NAME,
      segment =>
        segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === `POST ${PREFIX}/request-data`,
    );

    const response = await fetch(`${baseURL}${PREFIX}/request-data`, {
      method: 'POST',
      headers: { 'X-Custom-Header': 'test-value' },
    });
    expect(response.status).toBe(200);

    const segment = await segmentPromise;
    expect(segment.attributes['http.request.method']?.value).toBe('POST');
    expect(segment.attributes['url.full']?.value).toContain(PREFIX);
    expect(segment.attributes['http.request.header.x-custom-header']?.value).toBe('test-value');
  });
});

test('async handler sends span', async ({ baseURL }) => {
  const segmentPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    segment => getSpanOp(segment) === 'http.server' && segment.name === `GET ${PREFIX}/async`,
  );

  const response = await fetch(`${baseURL}${PREFIX}/async`);
  expect(response.status).toBe(200);

  const segmentSpans = await segmentPromise;
  const segment = segmentSpans.find(
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === `GET ${PREFIX}/async`,
  )!;
  expect(segment.name).toBe(`GET ${PREFIX}/async`);
  expect(getSpanOp(segment)).toBe('http.server');
  expect(segment.attributes?.['sentry.segment.name.source']?.value).toBe('route');

  const spans = segmentSpans.filter(
    span => !span.is_segment && span.attributes['sentry.segment.id']?.value === segment.span_id,
  );
  const middlewareSpans = spans.filter(s => getSpanOp(s) === 'middleware');
  expect(middlewareSpans).toEqual([]);
});
