import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('Sends an API route transaction', async ({ baseURL }) => {
  const pageloadTransactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-transaction'
    );
  });

  await fetch(`${baseURL}/test-transaction`);

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent.contexts?.trace).toEqual({
    data: {
      'sentry.source': 'route',
      'sentry.origin': 'auto.http.otel.http',
      'sentry.op': 'http.server',
      'sentry.sample_rate': 1,
      url: 'http://localhost:3030/test-transaction',
      'otel.kind': 'SERVER',
      'http.response.status_code': 200,
      'http.url': 'http://localhost:3030/test-transaction',
      'http.host': 'localhost:3030',
      'net.host.name': 'localhost',
      'http.method': 'GET',
      'http.scheme': 'http',
      'http.target': '/test-transaction',
      'http.user_agent': 'node',
      'http.flavor': '1.1',
      'net.transport': 'ip_tcp',
      'net.host.ip': expect.any(String),
      'net.host.port': expect.any(Number),
      'net.peer.ip': expect.any(String),
      'net.peer.port': expect.any(Number),
      'http.status_code': 200,
      'http.status_text': 'OK',
      'http.route': '/test-transaction',
    },
    op: 'http.server',
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    status: 'ok',
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    origin: 'auto.http.otel.http',
  });

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.origin': 'auto.http.otel.fastify',
            'sentry.op': 'hook.fastify',
            'service.name': 'fastify',
            'hook.name': 'fastify -> @fastify/otel -> @fastify/middie - onRequest',
            'fastify.type': 'hook',
            'hook.callback.name': 'runMiddie',
          },
          description: '@fastify/middie - onRequest',
          op: 'hook.fastify',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'auto.http.otel.fastify',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.origin': 'auto.http.otel.fastify',
            'sentry.op': 'request-handler.fastify',
            'service.name': 'fastify',
            'hook.name': 'fastify -> @fastify/otel -> @fastify/middie - route-handler',
            'fastify.type': 'request-handler',
            'http.route': '/test-transaction',
            'hook.callback.name': 'anonymous',
          },
          description: '@fastify/middie - route-handler',
          op: 'request-handler.fastify',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'auto.http.otel.fastify',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.origin': 'auto.http.otel.nestjs',
            'sentry.op': 'request_context.nestjs',
            component: '@nestjs/core',
            'nestjs.version': expect.any(String),
            'nestjs.type': 'request_context',
            'http.method': 'GET',
            'http.url': '/test-transaction',
            'http.route': '/test-transaction',
            'nestjs.controller': 'AppController',
            'nestjs.callback': 'testTransaction',
            url: '/test-transaction',
          },
          description: 'GET /test-transaction',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'request_context.nestjs',
          origin: 'auto.http.otel.nestjs',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.origin': 'auto.http.otel.nestjs',
            'sentry.op': 'handler.nestjs',
            component: '@nestjs/core',
            'nestjs.version': expect.any(String),
            'nestjs.type': 'handler',
            'nestjs.callback': 'testTransaction',
          },
          description: 'testTransaction',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'handler.nestjs',
          origin: 'auto.http.otel.nestjs',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: { 'sentry.origin': 'manual' },
          description: 'test-span',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: { 'sentry.origin': 'manual' },
          description: 'child-span',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
      ]),
      start_timestamp: expect.any(Number),
      timestamp: expect.any(Number),
      transaction: 'GET /test-transaction',
      transaction_info: {
        source: 'route',
      },
      type: 'transaction',
    }),
  );

  const spanDescriptions = transactionEvent.spans.map(span => span.description);
  expect(spanDescriptions).not.toContain('SentryTracingInterceptor');
});

test('API route transaction includes nest middleware span. Spans created in and after middleware are nested correctly', async ({
  baseURL,
}) => {
  const pageloadTransactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-middleware-instrumentation'
    );
  });

  const response = await fetch(`${baseURL}/test-middleware-instrumentation`);
  expect(response.status).toBe(200);

  const transactionEvent = await pageloadTransactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware.nestjs',
            'sentry.origin': 'auto.middleware.nestjs',
          },
          description: 'ExampleMiddleware',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
        },
      ]),
    }),
  );

  const exampleMiddlewareSpan = transactionEvent.spans.find(span => span.description === 'ExampleMiddleware');
  const exampleMiddlewareSpanId = exampleMiddlewareSpan?.span_id;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: expect.any(Object),
          description: 'test-controller-span',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: expect.any(Object),
          description: 'test-middleware-span',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
      ]),
    }),
  );

  // verify correct span parent-child relationships
  const testMiddlewareSpan = transactionEvent.spans.find(span => span.description === 'test-middleware-span');
  const testControllerSpan = transactionEvent.spans.find(span => span.description === 'test-controller-span');

  // 'ExampleMiddleware' is the parent of 'test-middleware-span'
  expect(testMiddlewareSpan.parent_span_id).toBe(exampleMiddlewareSpanId);

  // 'ExampleMiddleware' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan.parent_span_id).not.toBe(exampleMiddlewareSpanId);
});

test('API route transaction includes nest guard span and span started in guard is nested correctly', async ({
  baseURL,
}) => {
  const transactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-guard-instrumentation'
    );
  });

  const response = await fetch(`${baseURL}/test-guard-instrumentation`);
  expect(response.status).toBe(200);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware.nestjs',
            'sentry.origin': 'auto.middleware.nestjs',
          },
          description: 'ExampleGuard',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
        },
      ]),
    }),
  );

  const exampleGuardSpan = transactionEvent.spans.find(span => span.description === 'ExampleGuard');
  const exampleGuardSpanId = exampleGuardSpan?.span_id;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: expect.any(Object),
          description: 'test-guard-span',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
      ]),
    }),
  );

  // verify correct span parent-child relationships
  const testGuardSpan = transactionEvent.spans.find(span => span.description === 'test-guard-span');

  // 'ExampleGuard' is the parent of 'test-guard-span'
  expect(testGuardSpan.parent_span_id).toBe(exampleGuardSpanId);
});

test('API route transaction includes nest pipe span for valid request', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-pipe-instrumentation/:id' &&
      transactionEvent?.request?.url?.includes('/test-pipe-instrumentation/123')
    );
  });

  const response = await fetch(`${baseURL}/test-pipe-instrumentation/123`);
  expect(response.status).toBe(200);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware.nestjs',
            'sentry.origin': 'auto.middleware.nestjs',
          },
          description: 'ParseIntPipe',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
        },
      ]),
    }),
  );
});

test('API route transaction includes nest pipe span for invalid request', async ({ baseURL }) => {
  const transactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-pipe-instrumentation/:id' &&
      transactionEvent?.request?.url?.includes('/test-pipe-instrumentation/abc')
    );
  });

  const response = await fetch(`${baseURL}/test-pipe-instrumentation/abc`);
  expect(response.status).toBe(400);

  const transactionEvent = await transactionEventPromise;

  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware.nestjs',
            'sentry.origin': 'auto.middleware.nestjs',
          },
          description: 'ParseIntPipe',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'unknown_error',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
        },
      ]),
    }),
  );
});

test('API route transaction includes nest interceptor spans before route execution. Spans created in and after interceptor are nested correctly', async ({
  baseURL,
}) => {
  const pageloadTransactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-interceptor-instrumentation'
    );
  });

  const response = await fetch(`${baseURL}/test-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const transactionEvent = await pageloadTransactionEventPromise;

  // check if interceptor spans before route execution exist
  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware.nestjs',
            'sentry.origin': 'auto.middleware.nestjs',
          },
          description: 'ExampleInterceptor1',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware.nestjs',
            'sentry.origin': 'auto.middleware.nestjs',
          },
          description: 'ExampleInterceptor2',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
        },
      ]),
    }),
  );

  // get interceptor spans
  const exampleInterceptor1Span = transactionEvent.spans.find(span => span.description === 'ExampleInterceptor1');
  const exampleInterceptor1SpanId = exampleInterceptor1Span?.span_id;
  const exampleInterceptor2Span = transactionEvent.spans.find(span => span.description === 'ExampleInterceptor2');
  const exampleInterceptor2SpanId = exampleInterceptor2Span?.span_id;

  // check if manually started spans exist
  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: expect.any(Object),
          description: 'test-controller-span',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: expect.any(Object),
          description: 'test-interceptor-span-1',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: expect.any(Object),
          description: 'test-interceptor-span-2',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
      ]),
    }),
  );

  // verify correct span parent-child relationships
  const testInterceptor1Span = transactionEvent.spans.find(span => span.description === 'test-interceptor-span-1');
  const testInterceptor2Span = transactionEvent.spans.find(span => span.description === 'test-interceptor-span-2');
  const testControllerSpan = transactionEvent.spans.find(span => span.description === 'test-controller-span');

  // 'ExampleInterceptor1' is the parent of 'test-interceptor-span-1'
  expect(testInterceptor1Span.parent_span_id).toBe(exampleInterceptor1SpanId);

  // 'ExampleInterceptor1' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan.parent_span_id).not.toBe(exampleInterceptor1SpanId);

  // 'ExampleInterceptor2' is the parent of 'test-interceptor-span-2'
  expect(testInterceptor2Span.parent_span_id).toBe(exampleInterceptor2SpanId);

  // 'ExampleInterceptor2' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan.parent_span_id).not.toBe(exampleInterceptor2SpanId);
});

test('API route transaction includes exactly one nest interceptor span after route execution. Spans created in controller and in interceptor are nested correctly', async ({
  baseURL,
}) => {
  const pageloadTransactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-interceptor-instrumentation'
    );
  });

  const response = await fetch(`${baseURL}/test-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const transactionEvent = await pageloadTransactionEventPromise;

  // check if interceptor spans after route execution exist
  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware.nestjs',
            'sentry.origin': 'auto.middleware.nestjs',
          },
          description: 'Interceptors - After Route',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
        },
      ]),
    }),
  );

  // check that exactly one after route span is sent
  const allInterceptorSpansAfterRoute = transactionEvent.spans.filter(
    span => span.description === 'Interceptors - After Route',
  );
  expect(allInterceptorSpansAfterRoute.length).toBe(1);

  // get interceptor span
  const exampleInterceptorSpanAfterRoute = transactionEvent.spans.find(
    span => span.description === 'Interceptors - After Route',
  );
  const exampleInterceptorSpanAfterRouteId = exampleInterceptorSpanAfterRoute?.span_id;

  // check if manually started span in interceptor after route exists
  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: expect.any(Object),
          description: 'test-interceptor-span-after-route',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
      ]),
    }),
  );

  // verify correct span parent-child relationships
  const testInterceptorSpanAfterRoute = transactionEvent.spans.find(
    span => span.description === 'test-interceptor-span-after-route',
  );
  const testControllerSpan = transactionEvent.spans.find(span => span.description === 'test-controller-span');

  // 'Interceptor - After Route' is the parent of 'test-interceptor-span-after-route'
  expect(testInterceptorSpanAfterRoute.parent_span_id).toBe(exampleInterceptorSpanAfterRouteId);

  // 'Interceptor - After Route' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan.parent_span_id).not.toBe(exampleInterceptorSpanAfterRouteId);
});

test('API route transaction includes nest async interceptor spans before route execution. Spans created in and after async interceptor are nested correctly', async ({
  baseURL,
}) => {
  const pageloadTransactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-async-interceptor-instrumentation'
    );
  });

  const response = await fetch(`${baseURL}/test-async-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const transactionEvent = await pageloadTransactionEventPromise;

  // check if interceptor spans before route execution exist
  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware.nestjs',
            'sentry.origin': 'auto.middleware.nestjs',
          },
          description: 'AsyncInterceptor',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
        },
      ]),
    }),
  );

  // get interceptor spans
  const exampleAsyncInterceptor = transactionEvent.spans.find(span => span.description === 'AsyncInterceptor');
  const exampleAsyncInterceptorSpanId = exampleAsyncInterceptor?.span_id;

  // check if manually started spans exist
  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: expect.any(Object),
          description: 'test-controller-span',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: expect.any(Object),
          description: 'test-async-interceptor-span',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
      ]),
    }),
  );

  // verify correct span parent-child relationships
  const testAsyncInterceptorSpan = transactionEvent.spans.find(
    span => span.description === 'test-async-interceptor-span',
  );
  const testControllerSpan = transactionEvent.spans.find(span => span.description === 'test-controller-span');

  // 'AsyncInterceptor' is the parent of 'test-async-interceptor-span'
  expect(testAsyncInterceptorSpan.parent_span_id).toBe(exampleAsyncInterceptorSpanId);

  // 'AsyncInterceptor' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan.parent_span_id).not.toBe(exampleAsyncInterceptorSpanId);
});

test('API route transaction includes exactly one nest async interceptor span after route execution. Spans created in controller and in async interceptor are nested correctly', async ({
  baseURL,
}) => {
  const pageloadTransactionEventPromise = waitForTransaction('nestjs-fastify', transactionEvent => {
    return (
      transactionEvent?.contexts?.trace?.op === 'http.server' &&
      transactionEvent?.transaction === 'GET /test-async-interceptor-instrumentation'
    );
  });

  const response = await fetch(`${baseURL}/test-async-interceptor-instrumentation`);
  expect(response.status).toBe(200);

  const transactionEvent = await pageloadTransactionEventPromise;

  // check if interceptor spans after route execution exist
  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: {
            'sentry.op': 'middleware.nestjs',
            'sentry.origin': 'auto.middleware.nestjs',
          },
          description: 'Interceptors - After Route',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
        },
      ]),
    }),
  );

  // check that exactly one after route span is sent
  const allInterceptorSpansAfterRoute = transactionEvent.spans.filter(
    span => span.description === 'Interceptors - After Route',
  );
  expect(allInterceptorSpansAfterRoute.length).toBe(1);

  // get interceptor span
  const exampleInterceptorSpanAfterRoute = transactionEvent.spans.find(
    span => span.description === 'Interceptors - After Route',
  );
  const exampleInterceptorSpanAfterRouteId = exampleInterceptorSpanAfterRoute?.span_id;

  // check if manually started span in interceptor after route exists
  expect(transactionEvent).toEqual(
    expect.objectContaining({
      spans: expect.arrayContaining([
        {
          span_id: expect.stringMatching(/[a-f0-9]{16}/),
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          data: expect.any(Object),
          description: 'test-async-interceptor-span-after-route',
          parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
          start_timestamp: expect.any(Number),
          timestamp: expect.any(Number),
          status: 'ok',
          origin: 'manual',
        },
      ]),
    }),
  );

  // verify correct span parent-child relationships
  const testInterceptorSpanAfterRoute = transactionEvent.spans.find(
    span => span.description === 'test-async-interceptor-span-after-route',
  );
  const testControllerSpan = transactionEvent.spans.find(span => span.description === 'test-controller-span');

  // 'Interceptor - After Route' is the parent of 'test-interceptor-span-after-route'
  expect(testInterceptorSpanAfterRoute.parent_span_id).toBe(exampleInterceptorSpanAfterRouteId);

  // 'Interceptor - After Route' is NOT the parent of 'test-controller-span'
  expect(testControllerSpan.parent_span_id).not.toBe(exampleInterceptorSpanAfterRouteId);
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

test('Calling @All method on service with Injectable decorator returns 200', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/test-all`);
  expect(response.status).toBe(200);
});
