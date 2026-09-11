import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipWASMTests } from '../../../utils/wasmHelpers';

// `named.wasm` is `../simple.wasm` plus a module-name subsection (`namedmodule`)
// in its `name` section. Chrome labels bytes-compiled modules with that name
// as `wasm://wasm/namedmodule-<hash>`, not with the fetch URL.
sentryTest(
  'maps frames of a module compiled from fetched bytes to its debug image',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipWASMTests(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('**/named.wasm', route => {
      const wasmModule = fs.readFileSync(path.resolve(__dirname, '..', 'named.wasm'));

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
          filename: 'https://localhost:5887/named.wasm',
          function: 'namedmodule.internal_func',
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
          code_file: 'https://localhost:5887/named.wasm',
          code_id: '0ba020cdd2444f7eafdd25999a8e9010',
          debug_file: null,
          debug_id: '0ba020cdd2444f7eafdd25999a8e90100',
          type: 'wasm',
        },
      ],
    });
  },
);
