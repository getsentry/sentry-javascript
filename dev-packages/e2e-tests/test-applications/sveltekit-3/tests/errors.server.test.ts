import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('server-side errors', () => {
  test('captures universal load error', async ({ page }) => {
    const errorEventPromise = waitForError('sveltekit-2', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Universal Load Error (server)';
    });

    await page.goto('/universal-load-error');

    const errorEvent = await errorEventPromise;
    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
      expect.objectContaining({
        function: 'load$1',
        in_app: true,
      }),
    );
  });

  test('captures server load error', async ({ page }) => {
    const errorEventPromise = waitForError('sveltekit-2', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Server Load Error';
    });

    await page.goto('/server-load-error');

    const errorEvent = await errorEventPromise;
    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
      expect.objectContaining({
        function: 'load$1',
        in_app: true,
      }),
    );
  });

  test('captures server route (GET) error', async ({ page }) => {
    const errorEventPromise = waitForError('sveltekit-2', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Server Route Error';
    });

    await page.goto('/server-route-error');

    const errorEvent = await errorEventPromise;
    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
      expect.objectContaining({
        filename: expect.stringContaining('app:///_server.ts'),
        function: 'GET',
        in_app: true,
      }),
    );

    expect(errorEvent.transaction).toEqual('GET /server-route-error');
  });

  test('captures error() thrown in server route with `wrapServerRouteWithSentry`', async ({ page }) => {
    const errorEventPromise = waitForError('sveltekit-2', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === "'HttpError' captured as exception with keys: body, status";
    });

    await page.goto('/wrap-server-route');

    expect(await errorEventPromise).toMatchObject({
      exception: {
        values: [
          {
            value: "'HttpError' captured as exception with keys: body, status",
            mechanism: {
              handled: false,
              type: 'auto.function.sveltekit.server_route',
            },
            stacktrace: { frames: expect.any(Array) },
          },
        ],
      },
      extra: {
        __serialized__: {
          body: {
            message: 'error() error',
          },
          status: 500,
        },
      },
    });
  });
});
