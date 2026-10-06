import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Captures an unhandled route failure through the HTTP reporting boundary', async ({ baseURL }) => {
  const errorEventPromise = waitForError('effect-4-node', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'User 42 could not be loaded';
  });

  const response = await fetch(`${baseURL}/test-error-reporter/unhandled/42`);
  expect(response.status).toBe(500);

  const errorEvent = await errorEventPromise;
  const exception = errorEvent.exception?.values?.[0];

  expect(errorEvent.level).toBe('error');
  expect(exception).toMatchObject({
    type: 'Error',
    value: 'User 42 could not be loaded',
    mechanism: { type: 'auto.function.effect.error_reporter', handled: false },
  });

  const frames = exception?.stacktrace?.frames ?? [];
  const throwingFrame = frames[frames.length - 1];
  expect(throwingFrame).toMatchObject({
    function: 'loadUser',
    filename: expect.stringMatching(/app\.js$/),
    context_line: expect.stringContaining('could not be loaded'),
    pre_context: expect.any(Array),
    post_context: expect.any(Array),
  });
});

test('Captures a failure reported with withErrorReporting before it is handled', async ({ baseURL }) => {
  const errorEventPromise = waitForError('effect-4-node', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Handled after reporting';
  });

  const response = await fetch(`${baseURL}/test-error-reporter/handled`);
  const body = await response.json();

  const errorEvent = await errorEventPromise;

  expect(response.status).toBe(200);
  expect(body).toEqual({ recovered: true });
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Handled after reporting');
});

test('Skips errors annotated with ErrorReporter.ignore', async ({ baseURL }) => {
  const ignoredEventPromise = waitForError('effect-4-node', event => {
    return !event.type && event.exception?.values?.[0]?.type === 'NotFoundError';
  }).then(() => 'ignored error received');

  const sentinelEventPromise = waitForError('effect-4-node', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'User sentinel could not be loaded';
  });

  const ignoredResponse = await fetch(`${baseURL}/test-error-reporter/ignored`);
  expect(ignoredResponse.status).toBe(500);

  await fetch(`${baseURL}/test-error-reporter/unhandled/sentinel`);
  await sentinelEventPromise;

  // Events arrive in order, so once the sentinel is here an ignored event would already have resolved.
  await expect(Promise.race([ignoredEventPromise, Promise.resolve('no ignored error')])).resolves.toBe(
    'no ignored error',
  );
});

test('Applies the severity and attributes annotations', async ({ baseURL }) => {
  const errorEventPromise = waitForError('effect-4-node', event => {
    return !event.type && event.exception?.values?.[0]?.type === 'RateLimitError';
  });

  await fetch(`${baseURL}/test-error-reporter/annotated`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.level).toBe('warning');
  expect(errorEvent.extra).toEqual({ retryAfter: 60 });
});
