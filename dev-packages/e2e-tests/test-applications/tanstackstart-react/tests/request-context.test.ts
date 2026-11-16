import { expect, test } from '@playwright/test';

test('Passes the request context from the server entry to a server route', async ({ baseURL }) => {
  const response = await fetch(`${baseURL}/api/request-context`);

  expect(await response.json()).toEqual({ fromServerEntry: 'request-context-value' });
});
