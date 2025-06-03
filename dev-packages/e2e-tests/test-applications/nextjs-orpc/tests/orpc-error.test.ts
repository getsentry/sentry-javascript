import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('should capture orpc error', async ({ page }) => {
  const orpcErrorPromise = waitForError('nextjs-orpc', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'You are hitting an error';
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
});
