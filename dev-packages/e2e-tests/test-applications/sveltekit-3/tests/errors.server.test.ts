import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test.describe('server-side errors', () => {
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
        filename: 'app:///src/routes/server-route-error/+server.ts',
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

test.describe('expected errors thrown with `error()`', () => {
  // SvelteKit 3 passes *every* error to `handleError`, discriminated by `kind` — including
  // expected ones thrown with `error()`, which never reached the hook on SvelteKit 2.
  // The SDK applies the same rule as everywhere else: 4xx are expected, 5xx are reported.
  //
  // These match on the request URL rather than the exception value: SvelteKit hands `handleError`
  // the error *body* (a plain object), so the captured exception gets a synthesized message
  // ("Object captured as exception with keys: ...") rather than the message passed to `error()`.
  test("doesn't capture a 4xx error", async ({ page }) => {
    let captured4xxError = false;
    // Deliberately floating: this must never resolve, so it can't be awaited
    void waitForError('sveltekit-3', errorEvent => {
      return !!errorEvent?.request?.url?.endsWith('/expected-error-4xx');
    }).then(() => {
      captured4xxError = true;
    });

    // The 5xx route *is* captured, so its error event is a concrete signal that the preceding
    // 4xx request was fully processed - no sleeping on a timeout to prove a negative.
    const signalErrorPromise = waitForError('sveltekit-3', errorEvent => {
      return !!errorEvent?.request?.url?.endsWith('/expected-error-5xx');
    });

    await page.goto('/expected-error-4xx');
    await page.goto('/expected-error-5xx');
    await signalErrorPromise;

    expect(captured4xxError).toBe(false);
  });

  test('captures a 5xx error', async ({ page }) => {
    const errorEventPromise = waitForError('sveltekit-3', errorEvent => {
      return !!errorEvent?.request?.url?.endsWith('/expected-error-5xx');
    });

    await page.goto('/expected-error-5xx');

    const errorEvent = await errorEventPromise;

    expect(errorEvent.exception?.values?.[0]?.mechanism).toEqual(
      expect.objectContaining({ type: 'auto.function.sveltekit.handle_error' }),
    );
  });
});
