import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Captures manually reported error', async ({ baseURL }) => {
  const errorEventPromise = waitForError('effect-node', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an error';
  });

  const response = await fetch(`${baseURL}/test-error`);
  const body = await response.json();

  const errorEvent = await errorEventPromise;

  expect(body.exceptionId).toBeDefined();
  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an error');
});

test('Captures thrown exception', async ({ baseURL }) => {
  const errorEventPromise = waitForError('effect-node', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception with id 123';
  });

  await fetch(`${baseURL}/test-exception/123`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('This is an exception with id 123');
});

test('Captures Effect.fail as error', async ({ baseURL }) => {
  const errorEventPromise = waitForError('effect-node', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'Effect failure';
  });

  await fetch(`${baseURL}/test-effect-fail`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Effect failure');
});

test('Captures Effect.die as error', async ({ baseURL }) => {
  const errorEventPromise = waitForError('effect-node', event => {
    return !event.type && event.exception?.values?.[0]?.value?.includes('Effect defect');
  });

  await fetch(`${baseURL}/test-effect-die`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values).toHaveLength(1);
  expect(errorEvent.exception?.values?.[0]?.value).toContain('Effect defect');
});
