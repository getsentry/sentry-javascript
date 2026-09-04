import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-with-submodules';

function findSpan(spans: SerializedStreamedSpan[], name: string): SerializedStreamedSpan | undefined {
  return spans.find(span => span.name === name);
}

test('Sends streamed spans for an API route from module', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /example-module/transaction');

  await fetch(`${baseURL}/example-module/transaction`);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  expect(segmentSpan).toMatchObject({
    name: 'GET /example-module/transaction',
    is_segment: true,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.origin': { type: 'string', value: 'auto.http.http_server' },
      'sentry.op': { type: 'string', value: 'http.server' },
      'sentry.segment.name.source': { type: 'string', value: 'route' },
      'sentry.sample_rate': { type: 'integer', value: 1 },
      'sentry.kind': { type: 'string', value: 'server' },
      'http.request.method': { type: 'string', value: 'GET' },
      'http.route': { type: 'string', value: '/example-module/transaction' },
      'http.response.status_code': { type: 'integer', value: 200 },
      'http.response.status_text': { type: 'string', value: 'OK' },
      'url.full': { type: 'string', value: 'http://localhost:3030/example-module/transaction' },
      'url.path': { type: 'string', value: '/example-module/transaction' },
      'url.scheme': { type: 'string', value: 'http' },
      'server.address': { type: 'string', value: 'localhost' },
      'server.port': { type: 'integer', value: 3030 },
      'user_agent.original': { type: 'string', value: 'node' },
    }),
  });

  expect(findSpan(spans, '/example-module/transaction')).toMatchObject({
    is_segment: false,
    status: 'ok',
    parent_span_id: segmentSpan.span_id,
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'handler' },
      'sentry.origin': { type: 'string', value: 'auto.http.express' },
      'express.name': { type: 'string', value: '/example-module/transaction' },
      'express.type': { type: 'string', value: 'request_handler' },
      'http.route': { type: 'string', value: '/example-module/transaction' },
    }),
  });

  // The Nest handler span carries the callback name as an attribute rather than in its name, which
  // stays low cardinality under span streaming.
  expect(findSpan(spans, 'Request handler')).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'handler' },
      'sentry.origin': { type: 'string', value: 'auto.http.nestjs' },
      component: { type: 'string', value: '@nestjs/core' },
      'nestjs.type': { type: 'string', value: 'handler' },
      'nestjs.callback': { type: 'string', value: 'testTransaction' },
      'nestjs.version': { type: 'string', value: expect.any(String) },
    }),
  });

  const testSpan = findSpan(spans, 'test-span');
  expect(testSpan).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({ 'sentry.origin': { type: 'string', value: 'manual' } }),
  });

  expect(findSpan(spans, 'child-span')).toMatchObject({
    is_segment: false,
    status: 'ok',
    parent_span_id: testSpan!.span_id,
    attributes: expect.objectContaining({ 'sentry.origin': { type: 'string', value: 'manual' } }),
  });

  for (const span of spans) {
    expect(span.trace_id).toBe(segmentSpan.trace_id);
  }
});

test('API route trace includes exception filter span for global filter in module registered after Sentry', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /example-module/expected-exception');

  const response = await fetch(`${baseURL}/example-module/expected-exception`);
  expect(response.status).toBe(400);

  const spans = await spansPromise;

  expect(findSpan(spans, 'ExampleExceptionFilter')).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.exception_filter' },
    }),
  });
});

test('API route trace includes exception filter span for local filter in module registered after Sentry', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    'GET /example-module-local-filter/expected-exception',
  );

  const response = await fetch(`${baseURL}/example-module-local-filter/expected-exception`);
  expect(response.status).toBe(400);

  const spans = await spansPromise;

  expect(findSpan(spans, 'LocalExampleExceptionFilter')).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.exception_filter' },
    }),
  });
});

test('API route trace includes exception filter span for global filter in module registered before Sentry', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    'GET /example-module-registered-first/expected-exception',
  );

  const response = await fetch(`${baseURL}/example-module-registered-first/expected-exception`);
  expect(response.status).toBe(400);

  const spans = await spansPromise;

  expect(findSpan(spans, 'ExampleExceptionFilterRegisteredFirst')).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.exception_filter' },
    }),
  });
});
