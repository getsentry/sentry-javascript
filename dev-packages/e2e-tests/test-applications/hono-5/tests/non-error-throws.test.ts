import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { APP_NAME } from './constants';

type ErrorEvent = Awaited<ReturnType<typeof waitForError>>;

// Match on the request URL, not on the transaction name: with a wrong route name, the 4xx test would
// pass without seeing the event.
async function collectErrorsOfRequest(baseURL: string, path: string): Promise<ErrorEvent[]> {
  const events: ErrorEvent[] = [];
  waitForError(APP_NAME, event => {
    if (event.request?.url?.endsWith(path)) {
      events.push(event);
    }
    return false;
  });

  // A 2xx route's segment is the flush guard: an error event of the first request arrives before it.
  const guardPromise = waitForStreamedSpan(
    APP_NAME,
    segment => segment.is_segment && getSpanOp(segment) === 'http.server' && segment.name === 'GET /',
  );

  const response = await fetch(`${baseURL}${path}`);
  expect(response.status).toBe(500);

  await fetch(`${baseURL}/`);
  await guardPromise;

  return events;
}

test.describe('non-Error throws', () => {
  [
    { thrown: 'string', path: '/test-errors/throw-string', value: 'Thrown string from route', serialized: undefined },
    {
      thrown: 'plain object',
      path: '/test-errors/throw-object',
      value: 'Object captured as exception with keys: reason',
      serialized: { reason: 'Thrown object from route' },
    },
  ].forEach(({ thrown, path, value, serialized }) => {
    test(`captures a thrown ${thrown} once`, async ({ baseURL }) => {
      const events = await collectErrorsOfRequest(baseURL!, path);

      expect(events).toHaveLength(1);
      const exceptions = events[0]?.exception?.values;
      expect(exceptions).toHaveLength(1);
      expect(exceptions?.[0]?.value).toBe(value);
      expect(exceptions?.[0]?.mechanism).toEqual({
        handled: false,
        synthetic: true,
        type: 'auto.http.hono.context_error',
      });
      expect(events[0]?.extra?.__serialized__).toEqual(serialized);
      expect(events[0]?.transaction).toBe(`GET ${path}`);
    });
  });

  test('does not capture a thrown object with a 4xx status', async ({ baseURL }) => {
    const events = await collectErrorsOfRequest(baseURL!, '/test-errors/throw-object-404');

    expect(events).toHaveLength(0);
  });
});
