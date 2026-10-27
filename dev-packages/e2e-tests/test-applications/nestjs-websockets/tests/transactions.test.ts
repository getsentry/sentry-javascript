import { expect, test } from '@playwright/test';
import { WEBSOCKET } from '@sentry/conventions/op';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { io } from 'socket.io-client';

test('Sends an HTTP segment span', async ({ baseURL }) => {
  const spanPromise = waitForStreamedSpan('nestjs-websockets', span => {
    return span.is_segment && span.name === 'GET /test-transaction';
  });

  await fetch(`${baseURL}/test-transaction`);

  const span = await spanPromise;

  expect(getSpanOp(span)).toBe('http.server');
  expect(span.status).toBe('ok');
});

test('Names WebSocket segment spans with the Socket.IO namespace and message pattern', async ({ baseURL }) => {
  const socket = io(`${baseURL}/events`);

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });

    const spanPromise = waitForStreamedSpan('nestjs-websockets', span => {
      return span.is_segment && span.name === 'WS /events test-transaction';
    });
    const responsePromise = new Promise<void>(resolve => {
      socket.once('test-transaction-response', () => resolve());
    });

    socket.emit('test-transaction', {});

    const [span] = await Promise.all([spanPromise, responsePromise]);

    expect(span.is_segment).toBe(true);
    expect(getSpanOp(span)).toBe(WEBSOCKET);
    expect(span.name).toBe('WS /events test-transaction');
  } finally {
    socket.disconnect();
  }
});
