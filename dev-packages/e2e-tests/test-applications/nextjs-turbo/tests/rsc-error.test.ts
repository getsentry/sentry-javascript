import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Should capture errors from server components', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-turbo', errorEvent => {
    return !!errorEvent?.exception?.values?.some(value => value.value === 'page rsc render error');
  });

  await page.goto(`/123/rsc-page-error`);

  const errorEvent = await errorEventPromise;

  expect(errorEvent.request).toMatchObject({
    headers: expect.any(Object),
    method: 'GET',
  });

  expect(errorEvent.contexts?.nextjs).toEqual({
    route_type: 'render',
    router_kind: 'App Router',
    router_path: '/[param]/rsc-page-error',
    request_path: '/123/rsc-page-error',
  });
});
