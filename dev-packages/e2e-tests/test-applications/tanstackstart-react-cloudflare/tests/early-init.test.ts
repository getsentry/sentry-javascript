import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('should capture errors thrown in client entry before hydration', async ({ page }) => {
  const errorEventPromise = waitForError('tanstackstart-react-cloudflare', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Client Entry Crash';
  });

  await page.goto('/crash-before-hydration');

  const errorEvent = await errorEventPromise;

  expect(errorEvent.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'Client Entry Crash',
  });

  const consoleBreadcrumbs = errorEvent.breadcrumbs?.filter(
    b => b.category === 'console' && b.message?.includes('early-breadcrumb-from-client-entry'),
  );

  expect(consoleBreadcrumbs?.length).toBeGreaterThanOrEqual(1);
});
