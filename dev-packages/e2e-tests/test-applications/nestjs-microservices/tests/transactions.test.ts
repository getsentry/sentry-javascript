import { expect, test } from '@playwright/test';
import { collectStreamedSpansUntilSegment, getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-microservices';

test('Sends an HTTP segment span', async ({ baseURL }) => {
  const spanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.is_segment && span.name === 'GET /test-transaction';
  });

  const response = await fetch(`${baseURL}/test-transaction`);
  expect(response.status).toBe(200);

  const span = await spanPromise;

  expect(getSpanOp(span)).toBe('http.server');
  expect(span.status).toBe('ok');
});

// Trace context does not propagate over NestJS TCP transport, so RPC spans are disconnected from
// the HTTP trace. Instead of appearing as child spans of the HTTP segment span, auto-instrumented
// NestJS guard/interceptor/pipe spans become segment spans of their own traces.
// This documents the current (broken) behavior — ideally these should be connected to the HTTP trace.

test('Microservice spans are not connected to the HTTP trace', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpansUntilSegment(APP_NAME, 'GET /test-microservice-sum');

  const response = await fetch(`${baseURL}/test-microservice-sum`);
  expect(response.status).toBe(200);

  const spans = await spansPromise;

  // The microservice span should be part of this trace but isn't due to missing trace propagation
  expect(spans.find(span => span.name === 'microservice-sum-operation')).toBeUndefined();
});

test('Microservice guard is emitted as a segment span of its own trace instead of being part of the HTTP trace', async ({
  baseURL,
}) => {
  const guardSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.is_segment && span.name === 'ExampleGuard';
  });

  await fetch(`${baseURL}/test-microservice-guard`);

  expect(await guardSpanPromise).toBeDefined();
});

test('Microservice interceptor is emitted as a segment span of its own trace instead of being part of the HTTP trace', async ({
  baseURL,
}) => {
  const interceptorSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.is_segment && span.name === 'ExampleInterceptor';
  });

  await fetch(`${baseURL}/test-microservice-interceptor`);

  expect(await interceptorSpanPromise).toBeDefined();
});

test('Microservice pipe is emitted as a segment span of its own trace instead of being part of the HTTP trace', async ({
  baseURL,
}) => {
  const pipeSpanPromise = waitForStreamedSpan(APP_NAME, span => {
    return span.is_segment && span.name === 'ExamplePipe';
  });

  await fetch(`${baseURL}/test-microservice-pipe`);

  expect(await pipeSpanPromise).toBeDefined();
});
