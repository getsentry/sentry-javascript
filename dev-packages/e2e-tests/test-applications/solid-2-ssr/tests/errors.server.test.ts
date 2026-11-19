import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('captures an error an Errored boundary catches during SSR', async ({ page }) => {
  const errorPromise = waitForError('solid-2-ssr', errorEvent => {
    return (
      errorEvent.exception?.values?.[0]?.value === 'Error thrown during SSR in Solid 2 SSR E2E test app' &&
      errorEvent.exception?.values?.[0]?.mechanism?.type === 'auto.function.solid.server'
    );
  });

  await page.goto('/ssr-error');

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'Error thrown during SSR in Solid 2 SSR E2E test app',
    mechanism: {
      type: 'auto.function.solid.server',
      handled: true,
      data: { kind: 'render', handling: 'fallback' },
    },
  });
  expect(errorEvent.contexts?.solid).toMatchObject({ kind: 'render', handling: 'fallback' });
  expect(errorEvent.transaction).toBe('GET /ssr-error');
});

test('captures an error thrown in a server function', async ({ page }) => {
  const errorPromise = waitForError('solid-2-ssr', errorEvent => {
    return (
      errorEvent.exception?.values?.[0]?.value === 'Error thrown from a server function in Solid 2 SSR E2E test app'
    );
  });

  await page.goto('/');
  await page.locator('#serverFunctionErrorBtn').click();

  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'Error thrown from a server function in Solid 2 SSR E2E test app',
    mechanism: {
      type: 'auto.function.solid.server',
      handled: true,
      data: { kind: 'server-function' },
    },
  });
  expect(errorEvent.contexts?.solid).toMatchObject({
    kind: 'server-function',
    function_id: expect.any(String),
  });
});
