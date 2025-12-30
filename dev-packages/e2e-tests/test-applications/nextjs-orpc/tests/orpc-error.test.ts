import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('should capture server-side orpc error', async ({ page }) => {
  const orpcErrorPromise = waitForError('nextjs-orpc', errorEvent => {
    return (
      errorEvent.exception?.values?.[0]?.value === 'You are hitting an error' &&
      errorEvent.contexts?.['runtime']?.name === 'node'
    );
  });

  await page.goto('/');
  await page.waitForTimeout(500);
  await page.getByRole('link', { name: 'Error' }).click();

  const orpcError = await orpcErrorPromise;

  expect(orpcError.exception).toMatchObject({
    values: [
      expect.objectContaining({
        value: 'You are hitting an error',
      }),
    ],
  });

  // orpc errors are captured manually by the orpc middleware (user-land)
  expect(orpcError.exception?.values?.[0]?.mechanism).toEqual({
    handled: true,
    type: 'generic',
  });
});
