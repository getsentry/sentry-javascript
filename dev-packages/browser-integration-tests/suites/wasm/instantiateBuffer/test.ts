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
  code_file: expect.stringMatching(/^wasm:\/\/wasm\/[0-9a-f]{8}$/),
  code_id: '0ba020cdd2444f7eafdd25999a8e9010',
  debug_file: null,
  debug_id: '0ba020cdd2444f7eafdd25999a8e90100',
  type: 'wasm',
};

const FRAME_MATCHER = {
  function: 'internal_func',
  in_app: true,
  instruction_addr: '0x8c',
  addr_mode: 'rel:0',
  platform: 'native',
};

sentryTest(
  'captured exception should include modified frames and debug_meta for non-streaming instantiation',
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

    expect(event.debug_meta).toMatchObject({ images: [IMAGE_MATCHER] });

    // On V8 the small-module (content-hashed) synthetic name must match
    // exactly, frames and image alike.
    const wasmFrame = event.exception.values[0].stacktrace.frames.find(
      (frame: { platform?: string }) => frame.platform === 'native',
    );
    expect(event.debug_meta.images[0].code_file).toBe(wasmFrame.filename);
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
