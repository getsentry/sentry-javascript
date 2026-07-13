import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { io } from 'socket.io-client';

test('Captures manually reported error in WebSocket gateway handler', async ({ baseURL }) => {
  const errorPromise = waitForError('nestjs-websockets', event => {
    return event.exception?.values?.[0]?.value === 'Manually captured WebSocket error';
  });

  const socket = io(baseURL!);
  await new Promise<void>(resolve => socket.on('connect', resolve));

  socket.emit('test-manual-capture', {});

  const error = await errorPromise;

  expect(error.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'Manually captured WebSocket error',
  });

  socket.disconnect();
});

test('Automatically captures unexpected errors in WebSocket gateway handlers', async ({ baseURL }) => {
  const errorPromise = waitForError('nestjs-websockets', event => {
    return event.exception?.values?.[0]?.value === 'This is an exception in a WebSocket handler';
  });

  const socket = io(baseURL!);
  await new Promise<void>(resolve => socket.on('connect', resolve));

  socket.emit('test-exception', {});

  const error = await errorPromise;

  expect(error.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'This is an exception in a WebSocket handler',
  });

  socket.disconnect();
});

// There is no good mechanism to verify that an event was NOT sent to Sentry.
// The idea here is that we first send a message that triggers an expected exception which won't be auto-captured,
// and then send a message that triggers a manually captured error which will be sent to Sentry.
// If the manually captured error arrives, we can deduce that the first exception was not sent,
// because Socket.IO guarantees message ordering: https://socket.io/docs/v4/delivery-guarantees
test('Does not automatically capture expected WebSocket exceptions', async ({ baseURL }) => {
  let errorEventOccurred = false;

  waitForError('nestjs-websockets', event => {
    if (!event.type && event.exception?.values?.[0]?.value === 'Expected WebSocket exception') {
      errorEventOccurred = true;
    }

    return false;
  });

  const manualCapturePromise = waitForError('nestjs-websockets', event => {
    return event.exception?.values?.[0]?.value === 'Manually captured WebSocket error';
  });

  const socket = io(baseURL!);
  await new Promise<void>(resolve => socket.on('connect', resolve));

  socket.emit('test-ws-exception', {});
  socket.emit('test-manual-capture', {});
  await manualCapturePromise;

  expect(errorEventOccurred).toBe(false);

  socket.disconnect();
});
