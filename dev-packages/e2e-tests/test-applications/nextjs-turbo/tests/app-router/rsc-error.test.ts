import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Should capture errors from server components', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-turbo', errorEvent => {
    return !!errorEvent?.exception?.values?.some(value => value.value === 'page rsc render error');
  });

  await page.goto(`/123/rsc-page-error`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent).toBeDefined();
  expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual({
    handled: false,
    type: 'auto.function.nextjs.on_request_error',
  });
});
