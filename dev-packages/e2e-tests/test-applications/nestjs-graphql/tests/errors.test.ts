import { test } from '@playwright/test';

test('Sends exception to Sentry', async ({ baseURL }) => {
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

  console.log(data);
});
