import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('server-side errors', () => {
  test('captures a render error an <Errored> contained, as thrown, located by component', async ({ page }) => {
    const errorEventPromise = waitForError('solid-2', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Solid 2 E2E test app server render';
    });

    await page.goto('/server-error');
    // The wire got the sanitized message; Sentry got the real one.
    await expect(page.locator('#serverErrorFallback')).toHaveText(/fallback: Internal Server Error/);

    const error = await errorEventPromise;
    expect(error).toMatchObject({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Error thrown from Solid 2 E2E test app server render',
            mechanism: { type: 'auto.function.solid.server.render.fallback', handled: true },
          },
        ],
      },
      tags: {
        'solid.kind': 'render',
        'solid.handling': 'fallback',
        'solid.owner': expect.stringContaining('<ServerError>'),
        'solid.boundary_path': expect.stringContaining('<Errored>'),
      },
      transaction: 'GET /server-error',
    });
  });

  test('captures a server function throw, unhandled, with the function id', async ({ page }) => {
    const errorEventPromise = waitForError('solid-2', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Error thrown from Solid 2 E2E test app server function';
    });

    await page.goto('/');
    await page.locator('#explodeBtn').click();
    await expect(page.locator('#callResult')).toHaveText(/caught:/);

    const error = await errorEventPromise;
    expect(error).toMatchObject({
      exception: {
        values: [
          {
            mechanism: { type: 'auto.function.solid.server.server-function.thrown', handled: true },
          },
        ],
      },
      tags: { 'solid.kind': 'server-function', 'solid.handling': 'thrown', 'solid.function': expect.any(String) },
    });
  });
});
