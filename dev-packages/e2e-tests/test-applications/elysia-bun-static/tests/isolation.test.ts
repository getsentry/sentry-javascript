import { expect, test } from '@playwright/test';

// The Elysia integration currently does not fork isolation scopes per request,
// so `setUser`/`setTag` on the isolation scope leaks between concurrent requests.
// This test documents the expected behavior once per-request isolation is implemented.
test.fixme('Concurrent requests have isolated scope data', async ({ baseURL }) => {
  // Fire 3 concurrent requests with different user IDs
  const [response1, response2, response3] = await Promise.all([
    fetch(`${baseURL}/test-isolation/user-1`),
    fetch(`${baseURL}/test-isolation/user-2`),
    fetch(`${baseURL}/test-isolation/user-3`),
  ]);

  const data1 = await response1.json();
  const data2 = await response2.json();
  const data3 = await response3.json();

  // Each response should have its own user ID — no leaking between requests
  expect(data1.userId).toBe('user-1');
  expect(data1.isolationScopeUserId).toBe('user-1');
  expect(data1.isolationScopeTag).toBe('user-1');

  expect(data2.userId).toBe('user-2');
  expect(data2.isolationScopeUserId).toBe('user-2');
  expect(data2.isolationScopeTag).toBe('user-2');

  expect(data3.userId).toBe('user-3');
  expect(data3.isolationScopeUserId).toBe('user-3');
  expect(data3.isolationScopeTag).toBe('user-3');
});
