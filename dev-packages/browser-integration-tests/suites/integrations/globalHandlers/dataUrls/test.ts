import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../utils/helpers';

/**
 * Tests a special case where the `globalHandlersIntegration` itself creates a stack frame instead of using
 * stack parsers. This is necessary because we don't always get an `error` object passed to `window.onerror`.
 * @see `globalhandlers.ts#_enhanceEventWithInitialFrame`
 */
sentryTest('detects and handles data urls on first stack frame', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const errorEventPromise = waitForErrorRequest(page, e => {
    return !!e.exception?.values;
  });

  await page.goto(url);

  const errorEvent = envelopeRequestParser(await errorEventPromise);

  expect(errorEvent?.exception?.values?.[0]).toEqual({
    mechanism: {
      handled: false,
      synthetic: true,
      type: 'auto.browser.global_handlers.onerror',
    },
    stacktrace: {
      frames: [
        {
          colno: expect.any(Number), // webkit reports different colno than chromium
          filename: '<data:text/javascript,base64>',
          function: '?',
          in_app: true,
          lineno: 4,
        },
      ],
    },
    type: 'Error',
    value: expect.stringMatching(/(Uncaught )?Error: Error thrown in worker/), // webikt throws without "Uncaught "
  });
});
