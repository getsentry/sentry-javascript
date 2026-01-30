import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('should isolate scope data across concurrent requests', async ({ request }) => {
  // Make 3 concurrent requests with different user IDs
  const [response1, response2, response3] = await Promise.all([
    request.get('/test-isolation/user-1'),
    request.get('/test-isolation/user-2'),
    request.get('/test-isolation/user-3'),
  ]);

  const data1 = await response1.json();
  const data2 = await response2.json();
  const data3 = await response3.json();

  // Each response should be properly isolated
  expect(data1.isIsolated).toBe(true);
  expect(data1.userId).toBe('user-1');
  expect(data1.scope.userId).toBe('user-1');
  expect(data1.scope.userIdTag).toBe('user-1');
  expect(data1.scope.currentUserId).toBe('user-1');

  expect(data2.isIsolated).toBe(true);
  expect(data2.userId).toBe('user-2');
  expect(data2.scope.userId).toBe('user-2');
  expect(data2.scope.userIdTag).toBe('user-2');
  expect(data2.scope.currentUserId).toBe('user-2');

  expect(data3.isIsolated).toBe(true);
  expect(data3.userId).toBe('user-3');
  expect(data3.scope.userId).toBe('user-3');
  expect(data3.scope.userIdTag).toBe('user-3');
  expect(data3.scope.currentUserId).toBe('user-3');
});

test('should isolate errors across concurrent requests', async ({ request }) => {
  const errorPromises = [
    waitForError('node-core-light-express', event => {
      return event?.exception?.values?.[0]?.value === 'Error for user user-1';
    }),
    waitForError('node-core-light-express', event => {
      return event?.exception?.values?.[0]?.value === 'Error for user user-2';
    }),
    waitForError('node-core-light-express', event => {
      return event?.exception?.values?.[0]?.value === 'Error for user user-3';
    }),
  ];

  // Make 3 concurrent requests that trigger errors
  await Promise.all([
    request.get('/test-isolation-error/user-1'),
    request.get('/test-isolation-error/user-2'),
    request.get('/test-isolation-error/user-3'),
  ]);

  const [error1, error2, error3] = await Promise.all(errorPromises);

  // Each error should have the correct user data
  expect(error1?.user?.id).toBe('user-1');
  expect(error1?.tags?.user_id).toBe('user-1');

  expect(error2?.user?.id).toBe('user-2');
  expect(error2?.tags?.user_id).toBe('user-2');

  expect(error3?.user?.id).toBe('user-3');
  expect(error3?.tags?.user_id).toBe('user-3');
});
