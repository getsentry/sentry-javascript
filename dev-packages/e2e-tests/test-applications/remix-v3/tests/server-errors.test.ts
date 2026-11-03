import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const APP_NAME = 'remix-v3';

test('reports an error thrown in a route handler, with its route', async ({ baseURL }) => {
  const errorPromise = waitForError(APP_NAME, event => event.exception?.values?.[0]?.value === 'Route handler failed');

  await fetch(`${baseURL}/boom`);

  const event = await errorPromise;
  expect(event.exception?.values?.[0]?.mechanism).toEqual({ handled: false, type: 'auto.http.remix_v3.middleware' });
  expect(event.transaction).toBe('GET /boom');
});

test('reports an error from a fetch handler that is not the router', async ({ baseURL }) => {
  const errorPromise = waitForError(APP_NAME, event => event.exception?.values?.[0]?.value === 'Plain handler failed');

  const response = await fetch(`${baseURL}/plain-throw`);

  expect(response.status).toBe(500);
  const event = await errorPromise;
  expect(event.exception?.values?.[0]?.mechanism).toEqual({ handled: false, type: 'auto.http.remix_v3.on_error' });
});

test('does not report a request the client aborted', async ({ baseURL }) => {
  const seen: string[] = [];
  void waitForError(APP_NAME, event => {
    seen.push(event.exception?.values?.[0]?.value ?? '');
    return false;
  });

  const controller = new AbortController();
  const slow = fetch(`${baseURL}/slow`, { signal: controller.signal }).catch(() => undefined);
  await expect.poll(async () => (await fetch(`${baseURL}/slow-started`)).text()).toBe('1');
  controller.abort();
  await slow;

  // A later real error proves the pipeline is live, so an abort error would have arrived before it.
  const sentinel = waitForError(APP_NAME, event => event.exception?.values?.[0]?.value === 'Route handler failed');
  await fetch(`${baseURL}/boom`);
  await sentinel;

  expect(seen.filter(value => value !== 'Route handler failed')).toEqual([]);
});
