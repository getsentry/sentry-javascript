import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../utils/helpers';

const bundle = process.env.PW_BUNDLE || '';
// We only want to run this in non-CDN bundle mode because
// thirdPartyErrorFilterIntegration is only available in the NPM package
if (bundle.startsWith('bundle')) {
  sentryTest.skip();
}

sentryTest('tags event if contains at least one third-party frame', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const errorEventPromise = waitForErrorRequest(page, e => {
    return e.exception?.values?.[0]?.value === 'I am a third party Error';
  });

  await page.route('**/thirdPartyScript.js', route =>
    route.fulfill({
      status: 200,
      body: readFileSync(join(__dirname, 'thirdPartyScript.js')),
    }),
  );

  await page.goto(url);

  const errorEvent = envelopeRequestParser(await errorEventPromise);
  expect(errorEvent.tags?.third_party_code).toBe(true);
});

/**
 * This test seems a bit more complicated than necessary but this is intentional:
 * When using `captureConsoleIntegration` in combination with `thirdPartyErrorFilterIntegration`
 * and `attachStacktrace: true`, the stack trace includes native code stack frames which previously broke
 * the third party error filtering logic.
 *
 * see https://github.com/getsentry/sentry-javascript/issues/17674
 */
sentryTest(
  "doesn't tag event if doesn't contain third-party frames",
  async ({ getLocalTestUrl, page, browserName }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const errorEventPromise = waitForErrorRequest(page, e => {
      return e.exception?.values?.[0]?.value === 'I am a first party Error';
    });

    await page.route('**/thirdPartyScript.js', route =>
      route.fulfill({
        status: 200,
        body: readFileSync(join(__dirname, 'thirdPartyScript.js')),
      }),
    );

    await page.goto(url);

    await page.click('#errBtn');

    const errorEvent = envelopeRequestParser(await errorEventPromise);

    expect(errorEvent.tags?.third_party_code).toBeUndefined();

    // ensure the stack trace includes native code stack frames which previously broke
    // the third party error filtering logic
    if (browserName === 'chromium') {
      expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toContainEqual({
        filename: '<anonymous>',
        function: 'Array.forEach',
        in_app: true,
      });
    } else if (browserName === 'webkit') {
      expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toContainEqual({
        filename: '[native code]',
        function: 'forEach',
        in_app: true,
      });
    }
  },
);
