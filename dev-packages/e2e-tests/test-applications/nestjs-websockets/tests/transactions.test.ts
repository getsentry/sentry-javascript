import { expect, test } from '@playwright/test';
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

test('Marks WebSocket segment spans as failed when the handler errors', async ({ baseURL }) => {
  const socket = io(`${baseURL}/events`);

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });

    const spanPromise = waitForStreamedSpan('nestjs-websockets', span => {
      return span.is_segment && span.name === 'WS /events test-transaction-error';
    });
    const exceptionPromise = new Promise<void>(resolve => {
      socket.once('exception', () => resolve());
    });

    socket.emit('test-transaction-error', {});

    const [span] = await Promise.all([spanPromise, exceptionPromise]);

    expect(span.is_segment).toBe(true);
    expect(getSpanOp(span)).toBe('websocket');
    expect(span.name).toBe('WS /events test-transaction-error');
    expect(span.status).toBe('error');
  } finally {
    socket.disconnect();
  }
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
    expect(getSpanOp(span)).toBe('websocket');
    expect(span.name).toBe('WS /events test-transaction');
  } finally {
    socket.disconnect();
  }
});

test('Starts a new trace for each WebSocket message on the same connection', async ({ baseURL }) => {
  const socket = io(`${baseURL}/events`);

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });

    const firstSpanPromise = waitForStreamedSpan('nestjs-websockets', span => {
      return span.is_segment && span.name === 'WS /events test-transaction';
    });
    socket.emit('test-transaction', {});
    const firstSpan = await firstSpanPromise;

    const secondSpanPromise = waitForStreamedSpan('nestjs-websockets', span => {
      return span.is_segment && span.name === 'WS /events test-transaction' && span.trace_id !== firstSpan.trace_id;
    });
    socket.emit('test-transaction', {});
    const secondSpan = await secondSpanPromise;

    expect(secondSpan.trace_id).not.toBe(firstSpan.trace_id);
  } finally {
    socket.disconnect();
  }
});
