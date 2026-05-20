import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Sends a client-side exception to Sentry', async ({ page }) => {
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'I am an error!';
  });

  await page.goto('/');

  const exceptionButton = page.locator('id=exception-button');
  await exceptionButton.click();

  const errorEvent = await errorPromise;

  expect(errorEvent).toBeDefined();
});

test('Sends a client-side ErrorBoundary exception to Sentry', async ({ page }) => {
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'Sentry React Component Error';
  });

  await page.goto('/client-error');

  const errorEvent = await errorPromise;

  expect(errorEvent).toBeDefined();
});

test('Reports a manually captured exception from a route', async ({ page }) => {
  // The route component runs on both server and browser, so two events are emitted.
  // We only care about the browser-side capture here.
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return (
      errorEvent.platform === 'javascript' &&
      errorEvent.exception?.values?.[0]?.value === 'Sentry Manually Captured Error'
    );
  });

  await page.goto('/capture-exception');

  const errorEvent = await errorPromise;

  expect(errorEvent.level).toBe('error');
  expect(errorEvent.transaction).toBe('/capture-exception');
  expect(errorEvent.exception?.values).toMatchObject([
    {
      type: 'Error',
      value: 'Sentry Manually Captured Error',
      stacktrace: { frames: expect.any(Array) },
      mechanism: { type: 'generic', handled: true },
    },
  ]);
});

test('Reports a manually captured message from a route', async ({ page }) => {
  const messagePromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.platform === 'javascript' && errorEvent.message === 'Sentry Manually Captured Message';
  });

  await page.goto('/capture-message');

  const messageEvent = await messagePromise;

  expect(messageEvent.level).toBe('info');
  expect(messageEvent.transaction).toBe('/capture-message');
});

test('Reports a click error with stacktrace and mechanism', async ({ page }) => {
  await page.goto('/click-error');

  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'ClickError';
  });

  await page.click('#click-error');

  const errorEvent = await errorPromise;

  expect(errorEvent.level).toBe('error');
  expect(errorEvent.sdk?.name).toBe('sentry.javascript.remix');
  expect(errorEvent.exception?.values).toMatchObject([
    {
      type: 'Error',
      value: 'ClickError',
      stacktrace: { frames: expect.any(Array) },
      mechanism: { type: 'auto.browser.browserapierrors.addEventListener', handled: false },
    },
  ]);

  const frames = errorEvent.exception?.values?.[0]?.stacktrace?.frames;
  expect(frames?.[frames.length - 1]?.function).toBe('onClick');
});

test('Does not report SSR errors on the client', async ({ page }) => {
  let clientErrorReceived = false;
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    // The server SDK emits the same error with `platform: 'node'` — only flag browser envelopes.
    if (errorEvent.platform === 'javascript' && errorEvent.exception?.values?.[0]?.value === 'Sentry SSR Test Error') {
      clientErrorReceived = true;
      return true;
    }
    return false;
  });

  await page.goto('/ssr-error').catch(() => {
    // expected to fail server-side
  });

  await Promise.race([errorPromise, new Promise(resolve => setTimeout(resolve, 3000))]);

  expect(clientErrorReceived).toBe(false);
});

test('Does not report thrown redirect responses on the client', async ({ page }) => {
  let clientErrorReceived = false;
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    if (errorEvent.platform === 'javascript') {
      clientErrorReceived = true;
      return true;
    }
    return false;
  });

  await page.goto('/throw-redirect');

  await Promise.race([errorPromise, new Promise(resolve => setTimeout(resolve, 3000))]);

  expect(clientErrorReceived).toBe(false);
});
