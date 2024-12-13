import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends a server-side exception to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('create-next-app', event => {
    return event.exception?.values?.[0]?.value === 'I am a server error!';
  });

  const response = await fetch(`${baseURL}/api/error`);

  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('I am a server error!');

  expect(errorEvent.request).toEqual({
    headers: expect.any(Object),
    cookies: {},
    method: 'GET',
    url: expect.stringContaining('/api/error'),
  });

  expect(errorEvent.transaction).toEqual('GET /api/error');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });
});
