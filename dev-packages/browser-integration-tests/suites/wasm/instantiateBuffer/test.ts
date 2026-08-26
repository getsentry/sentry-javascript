import type { Page, Route } from '@playwright/test';
import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipWASMTests } from '../../../utils/wasmHelpers';

function serveWasmFixture(page: Page): Promise<void> {
  return page.route('**/simple.wasm', (route: Route) => {
    const wasmModule = fs.readFileSync(path.resolve(__dirname, '..', 'simple.wasm'));

    return route.fulfill({
      status: 200,
      body: wasmModule,
      headers: {
        'Content-Type': 'application/wasm',
      },
    });
  });
}

const IMAGE_MATCHER = {
  code_id: '0ba020cdd2444f7eafdd25999a8e9010',
  debug_file: null,
  debug_id: '0ba020cdd2444f7eafdd25999a8e90100',
  type: 'wasm',
};

// Modules at or below V8's content-hashing cutoff are registered under a
// placeholder name, since the name the engine picks cannot be predicted.
const SMALL_IMAGE_MATCHER = { ...IMAGE_MATCHER, code_file: 'wasm://wasm/unknown' };

const FRAME_MATCHER = {
  function: 'internal_func',
  in_app: true,
  instruction_addr: '0x8c',
  addr_mode: 'rel:0',
  platform: 'native',
};

sentryTest(
  'falls back to the single buffer module below the content-hash cutoff',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipWASMTests(browserName) || browserName === 'firefox') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    await serveWasmFixture(page);
    await page.goto(url);

    const { event } = await page.evaluate(async () => {
      // @ts-expect-error this function exists
      return window.getEvent();
    });

    expect(event.exception.values[0].stacktrace.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ...FRAME_MATCHER,
          filename: expect.stringMatching(/^wasm:\/\/wasm\/[0-9a-f]{8}$/),
        }),
      ]),
    );

    expect(event.debug_meta).toMatchObject({ images: [SMALL_IMAGE_MATCHER] });
  },
);

sentryTest(
  'captured exception should include modified frames and debug_meta for non-streaming instantiation @firefox',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipWASMTests(browserName) || browserName !== 'firefox') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    await serveWasmFixture(page);
    await page.goto(url);

    const { event } = await page.evaluate(async () => {
      // @ts-expect-error this function exists
      return window.getEvent();
    });

    // Firefox derives the script name from the compile call site, so the
    // frame matches through the single-buffer-module fallback.
    expect(event.exception.values[0].stacktrace.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ...FRAME_MATCHER,
          filename: expect.stringContaining('> WebAssembly.instantiate'),
        }),
      ]),
    );

    expect(event.debug_meta).toMatchObject({ images: [SMALL_IMAGE_MATCHER] });
  },
);

sentryTest(
  'exactly matches the length-derived synthetic name for modules above the content-hash cutoff',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipWASMTests(browserName) || browserName === 'firefox') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    await serveWasmFixture(page);
    await page.goto(url);

    const { event, byteLength } = await page.evaluate(async () => {
      // @ts-expect-error this function exists
      return window.getEvent(17000);
    });

    // V8 does not content-hash modules above 16383 bytes; the synthetic name
    // derives from the byte length alone on every V8 version.
    expect(byteLength).toBeGreaterThan(16383);
    const expectedUrl = `wasm://wasm/${(byteLength * 4 + 2).toString(16).padStart(8, '0')}`;

    expect(event.exception.values[0].stacktrace.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ...FRAME_MATCHER,
          filename: expectedUrl,
        }),
      ]),
    );

    expect(event.debug_meta).toMatchObject({
      images: [{ ...IMAGE_MATCHER, code_file: expectedUrl }],
    });
  },
);

sentryTest(
  'falls back to the single buffer module for call-site-derived names above the content-hash cutoff @firefox',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipWASMTests(browserName) || browserName !== 'firefox') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    await serveWasmFixture(page);
    await page.goto(url);

    const { event, byteLength } = await page.evaluate(async () => {
      // @ts-expect-error this function exists
      return window.getEvent(17000);
    });

    expect(event.exception.values[0].stacktrace.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ...FRAME_MATCHER,
          filename: expect.stringContaining('> WebAssembly.instantiate'),
        }),
      ]),
    );

    const expectedUrl = `wasm://wasm/${(byteLength * 4 + 2).toString(16).padStart(8, '0')}`;
    expect(event.debug_meta).toMatchObject({ images: [{ ...IMAGE_MATCHER, code_file: expectedUrl }] });
  },
);
