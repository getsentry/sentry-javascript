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
