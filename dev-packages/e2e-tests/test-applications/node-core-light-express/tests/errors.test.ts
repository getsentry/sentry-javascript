import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('should capture errors', async ({ request }) => {
  const errorEventPromise = waitForError('node-core-light-express', event => {
    return event?.exception?.values?.[0]?.value === 'Test error from light mode';
  });

  const response = await request.get('/test-error');
  expect(response.status()).toBe(500);

  const errorEvent = await errorEventPromise;
  expect(errorEvent).toBeDefined();
  expect(errorEvent.exception?.values?.[0]?.value).toBe('Test error from light mode');
  expect(errorEvent.tags?.test).toBe('error');

  // Ensure IP address is not leaked when sendDefaultPii is not set
  expect(errorEvent.user?.ip_address).toBeUndefined();
});
