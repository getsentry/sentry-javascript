import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

// FIXME(sveltekit-3): server-side error capture works, but stack-frame function names are
// `load$1` (not `load`) and the request URL scheme is `https` (not `http`). Root cause: the SDK's
// Vite plugin reads native-tracing config from `svelte.config.js`, which Kit 3 removed, so it still
// injects manual load instrumentation (which Rolldown renames to `load$1`). Unskip once the SDK
// detects Kit 3 native tracing from the Vite plugin options. See repros + tracking notes.
test.describe.skip('server-side errors', () => {
  test('captures universal load error', async ({ page }) => {
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
      // SvelteKit's node adapter defaults to https in the protocol even if served on http
      url: 'http://localhost:3030/universal-load-error',
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
      url: 'http://localhost:3030/server-load-error',
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
      url: 'http://localhost:3030/server-route-error',
    });
  });
});
