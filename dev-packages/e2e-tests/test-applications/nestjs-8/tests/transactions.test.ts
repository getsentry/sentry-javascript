import { expect, test } from '@playwright/test';
import type { SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { collectStreamedSpansUntilSegment } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-8';

function findSpan(spans: SerializedStreamedSpan[], name: string): SerializedStreamedSpan | undefined {
  return spans.find(span => span.name === name);
}

test('Sends streamed spans for an API route', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-transaction');

  await fetch(`${baseURL}/test-transaction`);

  const spans = await spansPromise;
  const segmentSpan = spans.find(span => span.is_segment)!;

  expect(segmentSpan).toMatchObject({
    name: 'GET /test-transaction',
    is_segment: true,
    status: 'ok',
    attributes: expect.objectContaining({
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

  expect(findSpan(spans, '/test-transaction')).toMatchObject({
    is_segment: false,
    status: 'ok',
    parent_span_id: segmentSpan.span_id,
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'handler' },
      'sentry.origin': { type: 'string', value: 'auto.http.express' },
      'express.name': { type: 'string', value: '/test-transaction' },
      'express.type': { type: 'string', value: 'request_handler' },
      'http.route': { type: 'string', value: '/test-transaction' },
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

test('API route trace includes nest middleware span. Spans created in and after middleware are nested correctly', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-middleware-instrumentation');

  const response = await fetch(`${baseURL}/test-middleware-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;

  const exampleMiddlewareSpan = findSpan(spans, 'ExampleMiddleware');
  expect(exampleMiddlewareSpan).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs' },
    }),
  });

  const testMiddlewareSpan = findSpan(spans, 'test-middleware-span');
  const testControllerSpan = findSpan(spans, 'test-controller-span');

  expect(testMiddlewareSpan).toMatchObject({ is_segment: false, status: 'ok' });
  expect(testControllerSpan).toMatchObject({ is_segment: false, status: 'ok' });

  // 'ExampleMiddleware' is the parent of 'test-middleware-span'
  expect(testMiddlewareSpan!.parent_span_id).toBe(exampleMiddlewareSpan!.span_id);

  // 'ExampleMiddleware' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan!.parent_span_id).not.toBe(exampleMiddlewareSpan!.span_id);
});

test('API route trace includes nest guard span and span started in guard is nested correctly', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-guard-instrumentation');

  const response = await fetch(`${baseURL}/test-guard-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;

  const exampleGuardSpan = findSpan(spans, 'ExampleGuard');
  expect(exampleGuardSpan).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.guard' },
    }),
  });

  const testGuardSpan = findSpan(spans, 'test-guard-span');
  expect(testGuardSpan).toMatchObject({ is_segment: false, status: 'ok' });

  // 'ExampleGuard' is the parent of 'test-guard-span'
  expect(testGuardSpan!.parent_span_id).toBe(exampleGuardSpan!.span_id);
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

  expect(findSpan(spans, 'ParseIntPipe')).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.pipe' },
    }),
  });
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

  // Streamed spans only distinguish `ok` from `error`; the detailed status lives in
  // `sentry.status.message`.
  expect(findSpan(spans, 'ParseIntPipe')).toMatchObject({
    is_segment: false,
    status: 'error',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.pipe' },
      'sentry.status.message': { type: 'string', value: 'internal_error' },
    }),
  });
});

test('API route trace includes nest interceptor spans before route execution. Spans created in and after interceptor are nested correctly', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-interceptor-instrumentation');

  const response = await fetch(`${baseURL}/test-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;

  const exampleInterceptor1Span = findSpan(spans, 'ExampleInterceptor1');
  const exampleInterceptor2Span = findSpan(spans, 'ExampleInterceptor2');

  for (const interceptorSpan of [exampleInterceptor1Span, exampleInterceptor2Span]) {
    expect(interceptorSpan).toMatchObject({
      is_segment: false,
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'middleware' },
        'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.interceptor' },
      }),
    });
  }

  const testInterceptor1Span = findSpan(spans, 'test-interceptor-span-1');
  const testInterceptor2Span = findSpan(spans, 'test-interceptor-span-2');
  const testControllerSpan = findSpan(spans, 'test-controller-span');

  for (const manualSpan of [testInterceptor1Span, testInterceptor2Span, testControllerSpan]) {
    expect(manualSpan).toMatchObject({ is_segment: false, status: 'ok' });
  }

  // 'ExampleInterceptor1' is the parent of 'test-interceptor-span-1'
  expect(testInterceptor1Span!.parent_span_id).toBe(exampleInterceptor1Span!.span_id);

  // 'ExampleInterceptor1' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan!.parent_span_id).not.toBe(exampleInterceptor1Span!.span_id);

  // 'ExampleInterceptor2' is the parent of 'test-interceptor-span-2'
  expect(testInterceptor2Span!.parent_span_id).toBe(exampleInterceptor2Span!.span_id);

  // 'ExampleInterceptor2' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan!.parent_span_id).not.toBe(exampleInterceptor2Span!.span_id);
});

test('API route trace includes exactly one nest interceptor span after route execution. Spans created in controller and in interceptor are nested correctly', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-interceptor-instrumentation');

  const response = await fetch(`${baseURL}/test-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;

  const interceptorSpansAfterRoute = spans.filter(span => span.name === 'Interceptors - After Route');
  expect(interceptorSpansAfterRoute).toHaveLength(1);

  const interceptorSpanAfterRoute = interceptorSpansAfterRoute[0]!;
  expect(interceptorSpanAfterRoute).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.interceptor' },
    }),
  });

  const testInterceptorSpanAfterRoute = findSpan(spans, 'test-interceptor-span-after-route');
  const testControllerSpan = findSpan(spans, 'test-controller-span');

  expect(testInterceptorSpanAfterRoute).toMatchObject({ is_segment: false, status: 'ok' });

  // 'Interceptors - After Route' is the parent of 'test-interceptor-span-after-route'
  expect(testInterceptorSpanAfterRoute!.parent_span_id).toBe(interceptorSpanAfterRoute.span_id);

  // 'Interceptors - After Route' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan!.parent_span_id).not.toBe(interceptorSpanAfterRoute.span_id);
});

test('API route trace includes nest async interceptor spans before route execution. Spans created in and after async interceptor are nested correctly', async ({
  baseURL,
}) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-async-interceptor-instrumentation');

  const response = await fetch(`${baseURL}/test-async-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;

  const asyncInterceptorSpan = findSpan(spans, 'AsyncInterceptor');
  expect(asyncInterceptorSpan).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.interceptor' },
    }),
  });

  const testAsyncInterceptorSpan = findSpan(spans, 'test-async-interceptor-span');
  const testControllerSpan = findSpan(spans, 'test-controller-span');

  expect(testAsyncInterceptorSpan).toMatchObject({ is_segment: false, status: 'ok' });
  expect(testControllerSpan).toMatchObject({ is_segment: false, status: 'ok' });

  // 'AsyncInterceptor' is the parent of 'test-async-interceptor-span'
  expect(testAsyncInterceptorSpan!.parent_span_id).toBe(asyncInterceptorSpan!.span_id);

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

  const interceptorSpansAfterRoute = spans.filter(span => span.name === 'Interceptors - After Route');
  expect(interceptorSpansAfterRoute).toHaveLength(1);

  const interceptorSpanAfterRoute = interceptorSpansAfterRoute[0]!;
  expect(interceptorSpanAfterRoute).toMatchObject({
    is_segment: false,
    status: 'ok',
    attributes: expect.objectContaining({
      'sentry.op': { type: 'string', value: 'middleware' },
      'sentry.origin': { type: 'string', value: 'auto.middleware.nestjs.interceptor' },
    }),
  });

  const testInterceptorSpanAfterRoute = findSpan(spans, 'test-async-interceptor-span-after-route');
  const testControllerSpan = findSpan(spans, 'test-controller-span');

  expect(testInterceptorSpanAfterRoute).toMatchObject({ is_segment: false, status: 'ok' });

  // 'Interceptors - After Route' is the parent of 'test-async-interceptor-span-after-route'
  expect(testInterceptorSpanAfterRoute!.parent_span_id).toBe(interceptorSpanAfterRoute.span_id);

  // 'Interceptors - After Route' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan!.parent_span_id).not.toBe(interceptorSpanAfterRoute.span_id);
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
