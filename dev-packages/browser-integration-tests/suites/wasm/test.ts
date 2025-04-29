import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { sentryTest } from '../../utils/fixtures';
import { shouldSkipWASMTests } from '../../utils/wasmHelpers';

sentryTest(
  'captured exception should include modified frames and debug_meta attribute',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipWASMTests(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('**/simple.wasm', route => {
      const wasmModule = fs.readFileSync(path.resolve(__dirname, 'simple.wasm'));

      return route.fulfill({
        status: 200,
        body: wasmModule,
        headers: {
          'Content-Type': 'application/wasm',
        },
      });
    });

    await page.goto(url);

    const event = await page.evaluate(async () => {
      // @ts-expect-error this function exists
      return window.getEvent();
    });

    expect(event.exception.values[0].stacktrace.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: expect.stringMatching(/simple\.wasm$/),
          function: 'internal_func',
          in_app: true,
          instruction_addr: '0x8c',
          addr_mode: 'rel:0',
          platform: 'native',
        }),
        expect.objectContaining({
          filename: expect.stringMatching(/subject\.bundle\.js$/),
          function: 'crash',
          in_app: true,
        }),
      ]),
    );

    expect(event.debug_meta).toMatchObject({
      images: [
        {
          code_file: expect.stringMatching(/simple\.wasm$/),
          code_id: '0ba020cdd2444f7eafdd25999a8e9010',
          debug_file: null,
          debug_id: '0ba020cdd2444f7eafdd25999a8e90100',
          type: 'wasm',
        },
      ],
    });
  },
);
