import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import type { Event } from '@sentry/node';

const APP_NAME = 'node-nitro-3';

// Resolves once `/api/flush` returned and its segment span arrived, so the events sent before it arrived too.
async function flushEvents(request: { get: (url: string) => Promise<unknown> }): Promise<void> {
  const flushSpanPromise = waitForStreamedSpan(APP_NAME, span => span.is_segment && span.name === 'GET /api/flush');
  await request.get('/api/flush');
  await flushSpanPromise;
}

function collectErrors(isMatch: (event: Event) => boolean): Event[] {
  const events: Event[] = [];
  void waitForError(APP_NAME, event => {
    if (isMatch(event)) {
      events.push(event);
    }
    return false;
  });
  return events;
}

test('captures an error thrown in a route handler once', async ({ request }) => {
  const errors = collectErrors(event => !!event.exception?.values?.some(v => v.value === 'This is a test error'));

  const response = await request.get('/api/test-error');
  expect(response.status()).toBe(500);
  await flushEvents(request);

  expect(errors).toHaveLength(1);
  expect(errors[0]!.exception?.values).toEqual([
    expect.objectContaining({ type: 'Error', value: 'This is a test error' }),
    expect.objectContaining({
      type: 'HTTPError',
      value: 'This is a test error',
      mechanism: expect.objectContaining({ handled: false, type: 'auto.function.nitro.captureErrorHook' }),
    }),
  ]);
  expect(errors[0]!.contexts?.nitro).toEqual({ method: 'GET', path: '/api/test-error' });
  expect(errors[0]!.transaction).toBe('GET /api/test-error');
});

test('does not capture an `HTTPError` with a 4xx status', async ({ request }) => {
  const errors = collectErrors(event => !!event.exception?.values?.some(v => v.value === 'Explicit 400 test error'));

  const response = await request.get('/api/test-error-400');
  expect(response.status()).toBe(400);
  await flushEvents(request);

  expect(errors).toHaveLength(0);
});
