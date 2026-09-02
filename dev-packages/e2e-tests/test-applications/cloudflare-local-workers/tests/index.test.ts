import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';

/**
 * This must be the only test in here.
 *
 * Both the Worker and the Durable Object initialize their own AsyncLocalStorage
 * context. Wrangler dev is currently single-threaded locally, so when a previous
 * test (e.g. a websocket test) already sets up ALS, that context carries over
 * and masks bugs in our instrumentation - causing this test to pass when it
 * should fail.
 */
test('Worker and Durable Object both send segment spans when worker calls DO', async ({ baseURL }) => {
  // With span streaming, URL-sourced `http.server` spans are named by method only, so the worker
  // and the Durable Object segment can only be told apart by `url.path`.
  const spansPromise = collectStreamedSpans('cloudflare-local-workers', spans => {
    return (
      spans.some(
        span =>
          getSpanOp(span) === 'http.server' &&
          span.is_segment &&
          span.attributes['url.path']?.value === '/pass-to-object/storage/get',
      ) &&
      spans.some(
        span =>
          getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.path']?.value === '/storage/get',
      )
    );
  });

  const response = await fetch(`${baseURL}/pass-to-object/storage/get`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const workerSpan = spans.find(
    span =>
      getSpanOp(span) === 'http.server' &&
      span.is_segment &&
      span.attributes['url.path']?.value === '/pass-to-object/storage/get',
  )!;
  const doSpan = spans.find(
    span =>
      getSpanOp(span) === 'http.server' && span.is_segment && span.attributes['url.path']?.value === '/storage/get',
  )!;

  expect(workerSpan.name).toBe('GET');
  expect(workerSpan.attributes['sentry.segment.name.source']?.value).toBe('url');

  expect(doSpan.name).toBe('GET');
  expect(doSpan.attributes['sentry.segment.name.source']?.value).toBe('url');
  expect(spans.some(span => getSpanOp(span) === 'db' && span.parent_span_id === doSpan.span_id)).toBe(true);
});
