import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../utils/helpers';
import { shouldSkipWASMTests } from '../../../utils/wasmHelpers';

const bundle = process.env.PW_BUNDLE || '';
// We only want to run this in non-CDN bundle mode because both
// wasmIntegration and thirdPartyErrorFilterIntegration are only available in NPM packages
if (bundle.startsWith('bundle')) {
  sentryTest.skip();
}

sentryTest(
  'WASM frames should be recognized as first-party when applicationKey is configured',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipWASMTests(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('**/simple.wasm', route => {
      const wasmModule = fs.readFileSync(path.resolve(__dirname, '../simple.wasm'));

      return route.fulfill({
        status: 200,
        body: wasmModule,
        headers: {
          'Content-Type': 'application/wasm',
        },
      });
    });

    const errorEventPromise = waitForErrorRequest(page, e => {
      return e.exception?.values?.[0]?.value === 'WASM triggered error';
    });

    await page.goto(url);

    const errorEvent = envelopeRequestParser(await errorEventPromise);

    expect(errorEvent.tags?.third_party_code).toBeUndefined();

    // Verify we have WASM frames in the stacktrace
    expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: expect.stringMatching(/simple\.wasm$/),
          platform: 'native',
        }),
      ]),
    );
  },
);
