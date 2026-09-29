import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../utils/helpers';
import { shouldSkipWASMTests } from '../../../utils/wasmHelpers';

declare global {
  interface Window {
    wasmWorker: Worker;
    triggerWasmError: () => void;
    triggerWasmBufferError: () => void;
  }
}

const bundle = process.env.PW_BUNDLE || '';
if (bundle.startsWith('bundle')) {
  sentryTest.skip();
}

sentryTest(
  'WASM debug images from worker should be forwarded to main thread and attached to events',
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

    await page.route('**/worker.js', route => {
      return route.fulfill({
        path: `${__dirname}/assets/worker.js`,
      });
    });

    const errorEventPromise = waitForErrorRequest(page, e => {
      return e.exception?.values?.[0]?.value === 'WASM error from worker';
    });

    await page.goto(url);

    await page.waitForFunction(() => window.wasmWorker !== undefined);

    await page.evaluate(() => {
      window.triggerWasmError();
    });

    const errorEvent = envelopeRequestParser(await errorEventPromise);

    expect(errorEvent.exception?.values?.[0]?.value).toBe('WASM error from worker');

    expect(errorEvent.debug_meta?.images).toBeDefined();
    expect(errorEvent.debug_meta?.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'wasm',
          code_file: expect.stringMatching(/simple\.wasm$/),
          code_id: '0ba020cdd2444f7eafdd25999a8e9010',
          debug_id: '0ba020cdd2444f7eafdd25999a8e90100',
        }),
      ]),
    );

    expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: expect.stringMatching(/simple\.wasm$/),
          platform: 'native',
          instruction_addr: expect.stringMatching(/^0x[a-fA-F\d]+$/),
          addr_mode: expect.stringMatching(/^rel:\d+$/),
        }),
      ]),
    );
  },
);

sentryTest(
  'WASM frames from worker should be recognized as first-party when applicationKey is configured',
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

    await page.route('**/worker.js', route => {
      return route.fulfill({
        path: `${__dirname}/assets/worker.js`,
      });
    });

    const errorEventPromise = waitForErrorRequest(page, e => {
      return e.exception?.values?.[0]?.value === 'WASM error from worker';
    });

    await page.goto(url);

    await page.waitForFunction(() => window.wasmWorker !== undefined);

    await page.evaluate(() => {
      window.triggerWasmError();
    });

    const errorEvent = envelopeRequestParser(await errorEventPromise);

    expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: expect.stringMatching(/simple\.wasm$/),
          platform: 'native',
          module_metadata: expect.objectContaining({
            '_sentryBundlerPluginAppKey:wasm-worker-app': true,
          }),
        }),
      ]),
    );
  },
);

// `named.wasm` is `simple.wasm` plus a module-name subsection (`namedmodule`).
// Chrome labels bytes-compiled modules with a name as `wasm://wasm/namedmodule-<hash>`,
// not with the fetch URL, so the frame has to be linked to the image by that name.
sentryTest(
  'WASM frames from a module compiled from fetched bytes in a worker should map to its debug image',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipWASMTests(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.route('**/named.wasm', route => {
      const wasmModule = fs.readFileSync(path.resolve(__dirname, '../named.wasm'));
      return route.fulfill({
        status: 200,
        body: wasmModule,
        headers: {
          'Content-Type': 'application/wasm',
        },
      });
    });

    await page.route('**/worker.js', route => {
      return route.fulfill({
        path: `${__dirname}/assets/worker.js`,
      });
    });

    const errorEventPromise = waitForErrorRequest(page, e => {
      return e.exception?.values?.[0]?.value === 'WASM error from worker';
    });

    await page.goto(url);

    await page.waitForFunction(() => window.wasmWorker !== undefined);

    await page.evaluate(() => {
      window.triggerWasmBufferError();
    });

    const errorEvent = envelopeRequestParser(await errorEventPromise);

    expect(errorEvent.debug_meta?.images).toEqual([
      {
        type: 'wasm',
        code_file: 'https://localhost:5887/named.wasm',
        code_id: '0ba020cdd2444f7eafdd25999a8e9010',
        debug_file: null,
        debug_id: '0ba020cdd2444f7eafdd25999a8e90100',
      },
    ]);

    expect(errorEvent.exception?.values?.[0]?.stacktrace?.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: 'https://localhost:5887/named.wasm',
          function: 'namedmodule.internal_func',
          platform: 'native',
          instruction_addr: '0x8c',
          addr_mode: 'rel:0',
        }),
      ]),
    );
  },
);
