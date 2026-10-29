import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const APP_NAME = 'nestjs-webpack';

test('Sends an exception with the release injected by the webpack plugin', async ({ baseURL }) => {
  const errorEventPromise = waitForError(APP_NAME, event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  const response = await fetch(`${baseURL}/test-exception/123`);
  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.http.nestjs.global_filter',
  });
  expect(errorEvent.transaction).toEqual('GET /test-exception/:id');

  // Set by the release injection of `sentryWebpackPlugin` from `@sentry/nestjs/webpack`.
  expect(errorEvent.release).toBe('nestjs-webpack-e2e');
});
