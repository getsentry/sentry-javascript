import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-12';

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
function manualSpan(
  segmentSpan: SerializedStreamedSpan,
  name: string,
  parentSpanId: string | RegExp,
): Record<string, unknown> {
  return {
    name,
    span_id: expect.stringMatching(SPAN_ID),
    trace_id: segmentSpan.trace_id,
    parent_span_id: typeof parentSpanId === 'string' ? parentSpanId : expect.stringMatching(parentSpanId),
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

/** A Nest middleware-family span (middleware, guard, pipe, interceptor, exception filter). */
function nestMiddlewareSpan(
  segmentSpan: SerializedStreamedSpan,
  name: string,
  origin: string,
): Record<string, unknown> {
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
      'sentry.origin': { type: 'string', value: origin },
    },
  };
}

test('Sends streamed spans for an API route', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-transaction');

  await fetch(`${baseURL}/test-transaction`);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  // The segment span additionally carries the scope's contexts (os, device, runtime, culture), the
  // SDK's integration list and the user's IP, all of which vary by machine, so only the
  // request-specific attributes are pinned here. The child spans below are matched exhaustively.
  expect(segmentSpan).toEqual({
    name: 'GET /test-transaction',
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
      'http.route': { type: 'string', value: '/test-transaction' },
      'http.response.status_code': { type: 'integer', value: 200 },
      'http.response.status_text': { type: 'string', value: 'OK' },
      'url.full': { type: 'string', value: 'http://localhost:3030/test-transaction' },
      'url.path': { type: 'string', value: '/test-transaction' },
      'url.scheme': { type: 'string', value: 'http' },
      'server.address': { type: 'string', value: 'localhost' },
      'server.port': { type: 'integer', value: 3030 },
      'user_agent.original': { type: 'string', value: 'node' },
    }),
  });

  expect(findSpan(spans, '/test-transaction')).toEqual({
    name: '/test-transaction',
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
      'express.name': { type: 'string', value: '/test-transaction' },
      'express.type': { type: 'string', value: 'request_handler' },
      'http.route': { type: 'string', value: '/test-transaction' },
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

test('API route trace includes nest middleware span. Spans created in and after middleware are nested correctly', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-middleware-instrumentation');

  const response = await fetch(`${baseURL}/test-middleware-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  const exampleMiddlewareSpan = findSpan(spans, 'ExampleMiddleware');
  expect(exampleMiddlewareSpan).toEqual(nestMiddlewareSpan(segmentSpan, 'ExampleMiddleware', 'auto.middleware.nestjs'));

  // 'ExampleMiddleware' is the parent of 'test-middleware-span'
  expect(findSpan(spans, 'test-middleware-span')).toEqual(
    manualSpan(segmentSpan, 'test-middleware-span', exampleMiddlewareSpan!.span_id),
  );

  const testControllerSpan = findSpan(spans, 'test-controller-span');
  expect(testControllerSpan).toEqual(manualSpan(segmentSpan, 'test-controller-span', SPAN_ID));

  // 'ExampleMiddleware' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan!.parent_span_id).not.toBe(exampleMiddlewareSpan!.span_id);
});

test('API route trace includes nest guard span and span started in guard is nested correctly', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-guard-instrumentation');

  const response = await fetch(`${baseURL}/test-guard-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  const exampleGuardSpan = findSpan(spans, 'ExampleGuard');
  expect(exampleGuardSpan).toEqual(nestMiddlewareSpan(segmentSpan, 'ExampleGuard', 'auto.middleware.nestjs.guard'));

  // 'ExampleGuard' is the parent of 'test-guard-span'
  expect(findSpan(spans, 'test-guard-span')).toEqual(
    manualSpan(segmentSpan, 'test-guard-span', exampleGuardSpan!.span_id),
  );
});

test('API route trace includes nest pipe span for valid request', async ({ baseURL }) => {
  // Both pipe specs hit the same route, so the segment name alone does not tell their traces apart.
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    span =>
      span.name === 'GET /test-pipe-instrumentation/:id' &&
      span.attributes['url.path']?.value === '/test-pipe-instrumentation/123',
  );

  const response = await fetch(`${baseURL}/test-pipe-instrumentation/123`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  expect(findSpan(spans, 'ParseIntPipe')).toEqual(
    nestMiddlewareSpan(segmentSpan, 'ParseIntPipe', 'auto.middleware.nestjs.pipe'),
  );
});

test('API route trace includes nest pipe span for invalid request', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(
    APP_NAME,
    span =>
      span.name === 'GET /test-pipe-instrumentation/:id' &&
      span.attributes['url.path']?.value === '/test-pipe-instrumentation/abc',
  );

  const response = await fetch(`${baseURL}/test-pipe-instrumentation/abc`);
  expect(response.status).toBe(400);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  // Streamed spans only distinguish `ok` from `error`; the detailed status lives in
  // `sentry.status.message`.
  expect(findSpan(spans, 'ParseIntPipe')).toEqual({
    name: 'ParseIntPipe',
    span_id: expect.stringMatching(SPAN_ID),
    trace_id: segmentSpan.trace_id,
    parent_span_id: expect.stringMatching(SPAN_ID),
    start_timestamp: expect.any(Number),
    end_timestamp: expect.any(Number),
    is_segment: false,
    status: 'error',
    attributes: {
      ...commonAttributes(segmentSpan),
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.pipe' },
      'sentry.status.message': { type: 'string', value: 'internal_error' },
    },
  });
});

test('API route trace includes nest interceptor spans before route execution. Spans created in and after interceptor are nested correctly', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-interceptor-instrumentation');

  const response = await fetch(`${baseURL}/test-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  const exampleInterceptor1Span = findSpan(spans, 'ExampleInterceptor1');
  const exampleInterceptor2Span = findSpan(spans, 'ExampleInterceptor2');
  expect(exampleInterceptor1Span).toEqual(
    nestMiddlewareSpan(segmentSpan, 'ExampleInterceptor1', 'auto.middleware.nestjs.interceptor'),
  );
  expect(exampleInterceptor2Span).toEqual(
    nestMiddlewareSpan(segmentSpan, 'ExampleInterceptor2', 'auto.middleware.nestjs.interceptor'),
  );

  // Each interceptor is the parent of the span started inside it
  expect(findSpan(spans, 'test-interceptor-span-1')).toEqual(
    manualSpan(segmentSpan, 'test-interceptor-span-1', exampleInterceptor1Span!.span_id),
  );
  expect(findSpan(spans, 'test-interceptor-span-2')).toEqual(
    manualSpan(segmentSpan, 'test-interceptor-span-2', exampleInterceptor2Span!.span_id),
  );

  const testControllerSpan = findSpan(spans, 'test-controller-span');
  expect(testControllerSpan).toEqual(manualSpan(segmentSpan, 'test-controller-span', SPAN_ID));

  // Neither interceptor is the parent of 'test-controller-span'
  expect(testControllerSpan!.parent_span_id).not.toBe(exampleInterceptor1Span!.span_id);
  expect(testControllerSpan!.parent_span_id).not.toBe(exampleInterceptor2Span!.span_id);
});

test('API route trace includes exactly one nest interceptor span after route execution. Spans created in controller and in interceptor are nested correctly', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-interceptor-instrumentation');

  const response = await fetch(`${baseURL}/test-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  const interceptorSpansAfterRoute = spans.filter(span => span.name === 'Interceptors - After Route');
  expect(interceptorSpansAfterRoute).toHaveLength(1);

  const interceptorSpanAfterRoute = interceptorSpansAfterRoute[0]!;
  expect(interceptorSpanAfterRoute).toEqual(
    nestMiddlewareSpan(segmentSpan, 'Interceptors - After Route', 'auto.middleware.nestjs.interceptor'),
  );

  // 'Interceptors - After Route' is the parent of 'test-interceptor-span-after-route'
  expect(findSpan(spans, 'test-interceptor-span-after-route')).toEqual(
    manualSpan(segmentSpan, 'test-interceptor-span-after-route', interceptorSpanAfterRoute.span_id),
  );

  // 'Interceptors - After Route' is NOT the parent of 'test-controller-span'
  expect(findSpan(spans, 'test-controller-span')!.parent_span_id).not.toBe(interceptorSpanAfterRoute.span_id);
});

test('API route trace includes nest async interceptor spans before route execution. Spans created in and after async interceptor are nested correctly', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-async-interceptor-instrumentation');

  const response = await fetch(`${baseURL}/test-async-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  const asyncInterceptorSpan = findSpan(spans, 'AsyncInterceptor');
  expect(asyncInterceptorSpan).toEqual(
    nestMiddlewareSpan(segmentSpan, 'AsyncInterceptor', 'auto.middleware.nestjs.interceptor'),
  );

  // 'AsyncInterceptor' is the parent of 'test-async-interceptor-span'
  expect(findSpan(spans, 'test-async-interceptor-span')).toEqual(
    manualSpan(segmentSpan, 'test-async-interceptor-span', asyncInterceptorSpan!.span_id),
  );

  const testControllerSpan = findSpan(spans, 'test-controller-span');
  expect(testControllerSpan).toEqual(manualSpan(segmentSpan, 'test-controller-span', SPAN_ID));

  // 'AsyncInterceptor' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan!.parent_span_id).not.toBe(asyncInterceptorSpan!.span_id);
});

test('API route trace includes exactly one nest async interceptor span after route execution. Spans created in controller and in async interceptor are nested correctly', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-async-interceptor-instrumentation');

  const response = await fetch(`${baseURL}/test-async-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  const interceptorSpansAfterRoute = spans.filter(span => span.name === 'Interceptors - After Route');
  expect(interceptorSpansAfterRoute).toHaveLength(1);

  const interceptorSpanAfterRoute = interceptorSpansAfterRoute[0]!;
  expect(interceptorSpanAfterRoute).toEqual(
    nestMiddlewareSpan(segmentSpan, 'Interceptors - After Route', 'auto.middleware.nestjs.interceptor'),
  );

  // 'Interceptors - After Route' is the parent of 'test-async-interceptor-span-after-route'
  expect(findSpan(spans, 'test-async-interceptor-span-after-route')).toEqual(
    manualSpan(segmentSpan, 'test-async-interceptor-span-after-route', interceptorSpanAfterRoute.span_id),
  );

  // 'Interceptors - After Route' is NOT the parent of 'test-controller-span'
  expect(findSpan(spans, 'test-controller-span')!.parent_span_id).not.toBe(interceptorSpanAfterRoute.span_id);
});

test('Calling use method on service with Injectable decorator returns 200', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-service-use`);
  expect(response.status).toBe(200);
});

test('Calling transform method on service with Injectable decorator returns 200', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-service-transform`);
  expect(response.status).toBe(200);
});

test('Calling intercept method on service with Injectable decorator returns 200', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-service-intercept`);
  expect(response.status).toBe(200);
});

test('Calling canActivate method on service with Injectable decorator returns 200', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-service-canActivate`);
  expect(response.status).toBe(200);
});
