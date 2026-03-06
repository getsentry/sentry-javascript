import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { io, type Socket } from 'socket.io-client';

function connectSocket(baseURL: string): Promise<Socket> {
  const socket = io(baseURL);
  return new Promise<Socket>(resolve => socket.on('connect', resolve)).then(() => socket);
}

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

  const socket = await connectSocket(baseURL!);
  try {
    socket.emit('test-manual-span', {});

    const tx = await txPromise;
    expect(tx.transaction).toBe('test-ws-manual-span');
  } finally {
    socket.disconnect();
  }
});

test('WebSocket handler with guard includes guard span and nested manual span', async ({ baseURL }) => {
  const txPromise = waitForTransaction('nestjs-websockets', tx => {
    return tx?.transaction === 'ExampleGuard';
  });

  const socket = await connectSocket(baseURL!);
  try {
    socket.emit('test-guard-instrumentation', {});

    const tx = await txPromise;

    expect(tx.transaction).toBe('ExampleGuard');

    expect(tx.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'test-guard-span',
          parent_span_id: tx.contexts?.trace?.span_id,
          origin: 'manual',
          status: 'ok',
        }),
      ]),
    );
  } finally {
    socket.disconnect();
  }
});

test('WebSocket handler with interceptor includes interceptor span, after-route span, and nested manual spans', async ({
  baseURL,
}) => {
  const txPromise = waitForTransaction('nestjs-websockets', tx => {
    return tx?.transaction === 'ExampleInterceptor';
  });

  const socket = await connectSocket(baseURL!);
  try {
    socket.emit('test-interceptor-instrumentation', {});

    const tx = await txPromise;

    expect(tx.transaction).toBe('ExampleInterceptor');

    const rootSpanId = tx.contexts?.trace?.span_id;

    expect(tx.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'test-interceptor-span',
          parent_span_id: rootSpanId,
          origin: 'manual',
          status: 'ok',
        }),
        expect.objectContaining({
          description: 'Interceptors - After Route',
          op: 'middleware.nestjs',
          origin: 'auto.middleware.nestjs',
          status: 'ok',
        }),
      ]),
    );

    const afterRouteSpan = tx.spans.find(span => span.description === 'Interceptors - After Route');

    expect(tx.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'test-interceptor-span-after-route',
          parent_span_id: afterRouteSpan?.span_id,
        }),
      ]),
    );
  } finally {
    socket.disconnect();
  }
});

test('WebSocket handler with pipe includes pipe span', async ({ baseURL }) => {
  const txPromise = waitForTransaction('nestjs-websockets', tx => {
    return tx?.transaction === 'ParseIntPipe';
  });

  const socket = await connectSocket(baseURL!);
  try {
    socket.emit('test-pipe-instrumentation', '123');

    const tx = await txPromise;

    expect(tx.transaction).toBe('ParseIntPipe');
    expect(tx.contexts?.trace).toEqual(
      expect.objectContaining({
        op: 'middleware.nestjs',
        origin: 'auto.middleware.nestjs',
      }),
    );
  } finally {
    socket.disconnect();
  }
});
