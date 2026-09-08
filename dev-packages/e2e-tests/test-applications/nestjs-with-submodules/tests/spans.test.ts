import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-with-submodules';

const SPAN_ID = /^[a-f0-9]{16}$/;
const TRACE_ID = /^[a-f0-9]{32}$/;

function findSpan(spans: SerializedStreamedSpan[], name: string): SerializedStreamedSpan | undefined {
  return spans.find(span => span.name === name);
}

/**
 * The attributes span streaming puts on every span of a trace. Spelling them out is what lets the
 * child span assertions below use `toEqual`, so an unexpected attribute fails the test.
 */
function commonAttributes(segmentSpan: SerializedStreamedSpan): Record<string, unknown> {
  return {
    'sentry.trace_lifecycle': { type: 'string', value: 'stream' },
    'sentry.segment.name': { type: 'string', value: segmentSpan.name },
    'sentry.segment.id': { type: 'string', value: segmentSpan.span_id },
    'sentry.sdk.name': { type: 'string', value: 'sentry.javascript.nestjs' },
    'sentry.sdk.version': { type: 'string', value: expect.any(String) },
    'sentry.environment': { type: 'string', value: 'qa' },
    // CI builds the apps with a release, local runs have none. It comes from the client
    // options, so whatever the segment span got, every other span of the trace got too.
    ...(segmentSpan.attributes['sentry.release']
      ? { 'sentry.release': { type: 'string', value: expect.any(String) } }
      : {}),
  };
}

/** A manually started span, which carries nothing beyond the common attributes. */
function manualSpan(segmentSpan: SerializedStreamedSpan, name: string, parentSpanId: string): Record<string, unknown> {
  return {
    name,
    span_id: expect.stringMatching(SPAN_ID),
    trace_id: segmentSpan.trace_id,
    parent_span_id: parentSpanId,
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    is_segment: false,
    status: 'ok',
    attributes: {
      ...commonAttributes(segmentSpan),
      'sentry.origin': { type: 'string', value: 'manual' },
    },
  };
}

/** An exception filter span, which the specs below assert on by name. */
function exceptionFilterSpan(segmentSpan: SerializedStreamedSpan, name: string): Record<string, unknown> {
  return {
    name,
    span_id: expect.stringMatching(SPAN_ID),
    trace_id: segmentSpan.trace_id,
    parent_span_id: expect.stringMatching(SPAN_ID),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    is_segment: false,
    status: 'ok',
    attributes: {
      ...commonAttributes(segmentSpan),
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.exception_filter' },
    },
  };
}

test('Sends streamed spans for an API route from module', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /example-module/transaction');

  await fetch(`${baseURL}/example-module/transaction`);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  // The segment span additionally carries the scope's contexts (os, device, runtime, culture), the
  // SDK's integration list and the user's IP, all of which vary by machine, so only the
  // request-specific attributes are pinned here. The child spans below are matched exhaustively.
  expect(segmentSpan).toEqual({
    name: 'GET /example-module/transaction',
    span_id: expect.stringMatching(SPAN_ID),
    trace_id: expect.stringMatching(TRACE_ID),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    is_segment: true,
    status: 'ok',
    attributes: expect.objectContaining({
      ...commonAttributes(segmentSpan),
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

  expect(findSpan(spans, '/example-module/transaction')).toEqual({
    name: '/example-module/transaction',
    span_id: expect.stringMatching(SPAN_ID),
    trace_id: segmentSpan.trace_id,
    parent_span_id: segmentSpan.span_id,
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    is_segment: false,
    status: 'ok',
    attributes: {
      ...commonAttributes(segmentSpan),
      'sentry.op': { type: 'string', value: 'handler' },
      'sentry.origin': { type: 'string', value: 'auto.http.express' },
      'express.name': { type: 'string', value: '/example-module/transaction' },
      'express.type': { type: 'string', value: 'request_handler' },
      'http.route': { type: 'string', value: '/example-module/transaction' },
    },
  });

  // The Nest handler span carries the callback name as an attribute rather than in its name, which
  // stays low cardinality under span streaming.
  const nestHandlerSpan = findSpan(spans, 'Request handler');
  expect(nestHandlerSpan).toEqual({
    name: 'Request handler',
    span_id: expect.stringMatching(SPAN_ID),
    trace_id: segmentSpan.trace_id,
    parent_span_id: expect.stringMatching(SPAN_ID),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    is_segment: false,
    status: 'ok',
    attributes: {
      ...commonAttributes(segmentSpan),
      'sentry.op': { type: 'string', value: 'handler' },
      'sentry.origin': { type: 'string', value: 'auto.http.nestjs' },
      component: { type: 'string', value: '@nestjs/core' },
      'nestjs.type': { type: 'string', value: 'handler' },
      'nestjs.callback': { type: 'string', value: 'testTransaction' },
      'nestjs.version': { type: 'string', value: expect.any(String) },
    },
  });

  const testSpan = findSpan(spans, 'test-span');
  expect(testSpan).toEqual(manualSpan(segmentSpan, 'test-span', nestHandlerSpan!.span_id));
  expect(findSpan(spans, 'child-span')).toEqual(manualSpan(segmentSpan, 'child-span', testSpan!.span_id));
});

test('API route trace includes exception filter span for global filter in module registered after Sentry', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /example-module/expected-exception');

  const response = await fetch(`${baseURL}/example-module/expected-exception`);
  expect(response.status).toBe(400);

  const spans = await spansPromise;

  const segmentSpan = spans.find(span => span.is_segment)!;
  expect(findSpan(spans, 'ExampleExceptionFilter')).toEqual(exceptionFilterSpan(segmentSpan, 'ExampleExceptionFilter'));
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

  const segmentSpan = spans.find(span => span.is_segment)!;
  expect(findSpan(spans, 'LocalExampleExceptionFilter')).toEqual(
    exceptionFilterSpan(segmentSpan, 'LocalExampleExceptionFilter'),
  );
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

  const segmentSpan = spans.find(span => span.is_segment)!;
  expect(findSpan(spans, 'ExampleExceptionFilterRegisteredFirst')).toEqual(
    exceptionFilterSpan(segmentSpan, 'ExampleExceptionFilterRegisteredFirst'),
  );
});
