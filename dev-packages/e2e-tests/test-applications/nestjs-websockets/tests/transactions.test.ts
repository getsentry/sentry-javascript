import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { io } from 'socket.io-client';

test('Sends an HTTP transaction', async ({ baseURL }) => {
  const txPromise = waitForTransaction('nestjs-websockets', tx => {
    return tx?.contexts?.trace?.op === 'http.server' && tx?.transaction === 'GET /test-transaction';
  });

  await fetch(`${baseURL}/test-transaction`);

  const tx = await txPromise;

  expect(tx.contexts?.trace).toEqual(
    expect.objectContaining({
      op: 'http.server',
    }),
  );
});

test('WebSocket handler with manual Sentry.startSpan() sends a transaction', async ({ baseURL }) => {
  const txPromise = waitForTransaction('nestjs-websockets', tx => {
    return tx?.transaction === 'test-ws-manual-span';
  });

  const socket = io(baseURL!);
  await new Promise<void>(resolve => socket.on('connect', resolve));

  socket.emit('test-manual-span', {});

  const tx = await txPromise;

  expect(tx.transaction).toBe('test-ws-manual-span');

  socket.disconnect();
});

test('WebSocket handler with guard includes guard span and nested manual span', async ({ baseURL }) => {
  const txPromise = waitForTransaction('nestjs-websockets', tx => {
    return tx?.transaction === 'ExampleGuard' || tx?.spans?.some(span => span.description === 'ExampleGuard');
  });

  const socket = io(baseURL!);
  await new Promise<void>(resolve => socket.on('connect', resolve));
  socket.emit('test-guard-instrumentation', {});

  const tx = await txPromise;

  // Find the ExampleGuard span (either the root transaction or a child span)
  const guardSpan =
    tx.transaction === 'ExampleGuard'
      ? { span_id: tx.contexts?.trace?.span_id }
      : tx.spans.find(span => span.description === 'ExampleGuard');

  expect(guardSpan).toBeDefined();

  // If ExampleGuard is a child span, verify its properties
  if (tx.transaction !== 'ExampleGuard') {
    expect(tx.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'ExampleGuard',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
          status: 'ok',
        }),
      ]),
    );
  }

  // The manual span started inside the guard should be a child of the guard span
  expect(tx.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'test-guard-span',
        origin: 'manual',
        status: 'ok',
      }),
    ]),
  );

  const testGuardSpan = tx.spans.find(span => span.description === 'test-guard-span');
  expect(testGuardSpan.parent_span_id).toBe(guardSpan.span_id);

  socket.disconnect();
});

test('WebSocket handler with interceptor includes interceptor span, after-route span, and nested manual spans', async ({
  baseURL,
}) => {
  const txPromise = waitForTransaction('nestjs-websockets', tx => {
    return (
      tx?.transaction === 'ExampleInterceptor' || tx?.spans?.some(span => span.description === 'ExampleInterceptor')
    );
  });

  const socket = io(baseURL!);
  await new Promise<void>(resolve => socket.on('connect', resolve));
  socket.emit('test-interceptor-instrumentation', {});

  const tx = await txPromise;

  // Find the ExampleInterceptor span (either the root transaction or a child span)
  const interceptorSpan =
    tx.transaction === 'ExampleInterceptor'
      ? { span_id: tx.contexts?.trace?.span_id }
      : tx.spans.find(span => span.description === 'ExampleInterceptor');

  expect(interceptorSpan).toBeDefined();

  // If ExampleInterceptor is a child span, verify its properties
  if (tx.transaction !== 'ExampleInterceptor') {
    expect(tx.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'ExampleInterceptor',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
          status: 'ok',
        }),
      ]),
    );
  }

  // The manual span started inside the interceptor (before route) should be a child of the interceptor span
  expect(tx.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'test-interceptor-span',
        origin: 'manual',
        status: 'ok',
      }),
    ]),
  );

  const testInterceptorSpan = tx.spans.find(span => span.description === 'test-interceptor-span');
  expect(testInterceptorSpan.parent_span_id).toBe(interceptorSpan.span_id);

  // The after-route interceptor span should also be present
  expect(tx.spans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        description: 'Interceptors - After Route',
        op: 'middleware.nestjs',
        origin: 'auto.middleware.nestjs',
        status: 'ok',
      }),
    ]),
  );

  // The manual span started in the after-route tap should be nested under 'Interceptors - After Route'
  const afterRouteSpan = tx.spans.find(span => span.description === 'Interceptors - After Route');
  const testAfterRouteSpan = tx.spans.find(span => span.description === 'test-interceptor-span-after-route');

  expect(testAfterRouteSpan).toBeDefined();
  expect(testAfterRouteSpan.parent_span_id).toBe(afterRouteSpan?.span_id);

  socket.disconnect();
});

test('WebSocket handler with pipe includes pipe span', async ({ baseURL }) => {
  const txPromise = waitForTransaction('nestjs-websockets', tx => {
    return tx?.transaction === 'ParseIntPipe' || tx?.spans?.some(span => span.description === 'ParseIntPipe');
  });

  const socket = io(baseURL!);
  await new Promise<void>(resolve => socket.on('connect', resolve));
  socket.emit('test-pipe-instrumentation', '123');

  const tx = await txPromise;

  // ParseIntPipe can be the root transaction or a child span depending on transport
  if (tx.transaction === 'ParseIntPipe') {
    expect(tx.contexts?.trace).toEqual(
      expect.objectContaining({
        op: 'middleware.nestjs',
        origin: 'auto.middleware.nestjs',
      }),
    );
  } else {
    expect(tx.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'ParseIntPipe',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
          status: 'ok',
        }),
      ]),
    );
  }

  socket.disconnect();
});
