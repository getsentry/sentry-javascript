import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('captures error thrown in route handler', async ({ baseURL }) => {
  const errorWaiter = waitForError('hono-4-cf', event => {
    return event.exception?.values?.[0]?.value === 'This is a test error for Sentry!';
  });

  const response = await fetch(`${baseURL}/error/test-cause`);
  expect(response.status).toBe(500);

  const event = await errorWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('This is a test error for Sentry!');
});

test('captures HTTPException with 502 status', async ({ baseURL }) => {
  const errorWaiter = waitForError('hono-4-cf', event => {
    return event.exception?.values?.[0]?.value === 'HTTPException 502';
  });

  const response = await fetch(`${baseURL}/http-exception/502`);
  expect(response.status).toBe(502);

  const event = await errorWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('HTTPException 502');
});

// TODO: 401 and 404 HTTPExceptions should not be captured by Sentry by default,
// but currently they are. Fix the filtering and update these tests accordingly.
test('captures HTTPException with 401 status', async ({ baseURL }) => {
  const errorWaiter = waitForError('hono-4-cf', event => {
    return event.exception?.values?.[0]?.value === 'HTTPException 401';
  });

  const response = await fetch(`${baseURL}/http-exception/401`);
  expect(response.status).toBe(401);

  const event = await errorWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('HTTPException 401');
});

test('captures HTTPException with 404 status', async ({ baseURL }) => {
  const errorWaiter = waitForError('hono-4-cf', event => {
    return event.exception?.values?.[0]?.value === 'HTTPException 404';
  });

  const response = await fetch(`${baseURL}/http-exception/404`);
  expect(response.status).toBe(404);

  const event = await errorWaiter;
  expect(event.exception?.values?.[0]?.value).toBe('HTTPException 404');
});
