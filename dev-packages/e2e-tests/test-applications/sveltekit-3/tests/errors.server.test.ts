import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('server-side errors', () => {
  // FIXME(sveltekit-3): the universal load function's frame is reported as `load$1` (not `load`)
  // because the SDK still wraps universal `+page.ts` load in the server build. Unlike server-only
  // load, this isn't suppressed by native-tracing detection: the wrapper is skipped via
  // `config.build.ssr`, which is unreliable under Vite 8's Environment API. Unskip once the SDK
  // detects the server environment via the Vite Environment API.
  test.skip('captures universal load error', async ({ page }) => {
    const errorEventPromise = waitForError('sveltekit-3', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Universal Load Error (server)';
    });

    await page.goto('/universal-load-error');

    const errorEvent = await errorEventPromise;
    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
      expect.objectContaining({
        function: 'load',
        in_app: true,
      }),
    );

    expect(errorEvent.request).toEqual({
      cookies: {},
      headers: expect.objectContaining({
        accept: expect.any(String),
        'user-agent': expect.any(String),
      }),
      method: 'GET',
      url: 'https://localhost:3030/universal-load-error',
    });
  });

  test('captures server load error', async ({ page }) => {
    const errorEventPromise = waitForError('sveltekit-3', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Server Load Error';
    });

    await page.goto('/server-load-error');

    const errorEvent = await errorEventPromise;
    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
      expect.objectContaining({
        function: 'load',
        in_app: true,
      }),
    );

    expect(errorEvent.request).toEqual({
      cookies: {},
      headers: expect.objectContaining({
        accept: expect.any(String),
        'user-agent': expect.any(String),
      }),
      method: 'GET',
      url: 'https://localhost:3030/server-load-error',
    });
  });

  test('captures server route (GET) error', async ({ page }) => {
    const errorEventPromise = waitForError('sveltekit-3', errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === 'Server Route Error';
    });

    await page.goto('/server-route-error');

    const errorEvent = await errorEventPromise;
    const errorEventFrames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;

    expect(errorEventFrames?.[errorEventFrames?.length - 1]).toEqual(
      expect.objectContaining({
        filename: expect.stringMatching(/app:\/\/\/_server.ts-.+.js/),
        function: 'GET',
        in_app: true,
      }),
    );

    expect(errorEvent.transaction).toEqual('GET /server-route-error');

    expect(errorEvent.request).toEqual({
      cookies: {},
      headers: expect.objectContaining({
        accept: expect.any(String),
      }),
      method: 'GET',
      url: 'https://localhost:3030/server-route-error',
    });
  });
});
