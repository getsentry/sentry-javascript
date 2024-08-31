import { test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends exception to Sentry', async ({ baseURL }) => {
  const errorEventPromise = waitForError('nestjs-graphql', event => {
    return !event.type && event.exception?.values?.[0]?.value === 'This is an exception!';
  });

  const response = await fetch(`${baseURL}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query { error }`,
    }),
  });

  const data = await response.json();

  console.log(data['errors'][0]);

  const errorEvent = await errorEventPromise;

  console.log(errorEvent);

  // TODO: improve test
});
