import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Returns 400 from failed assert', async ({ baseURL }) => {
  const errorEventPromise = waitForError('node-koa', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'ctx.assert failed';
  });

  const res = await fetch(`${baseURL}/test-assert/false`);
  expect(res.status).toBe(400);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('ctx.assert failed');

  expect(errorEvent.request).toEqual({
    method: 'GET',
    cookies: {},
    headers: expect.any(Object),
    url: 'http://localhost:3030/test-assert/false',
  });

  expect(errorEvent.transaction).toEqual('GET /test-assert/:condition');

  expect(errorEvent.contexts?.trace).toEqual({
    trace_id: expect.stringMatching(/[a-f0-9]{32}/),
    span_id: expect.stringMatching(/[a-f0-9]{16}/),
    parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
  });
});

test('Returns 200 from successful assert', async ({ baseURL }) => {
  const res = await fetch(`${baseURL}/test-assert/true`);
  expect(res.status).toBe(200);
});
