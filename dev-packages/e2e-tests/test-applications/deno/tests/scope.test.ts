import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Scope isolation prevents tag leakage between scopes', async ({ baseURL }) => {
  const insideErrorPromise = waitForError('deno', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'inside-scope';
  });

  const outsideErrorPromise = waitForError('deno', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'outside-scope';
  });

  await fetch(`${baseURL}/test-scope-isolation`);

  const insideError = await insideErrorPromise;
  const outsideError = await outsideErrorPromise;

  // The error inside withScope should have the isolated tag
  expect(insideError.tags).toEqual(
    expect.objectContaining({
      isolated: 'yes',
    }),
  );

  // The error outside withScope should NOT have the isolated tag
  expect(outsideError.tags?.['isolated']).toBeUndefined();
});
