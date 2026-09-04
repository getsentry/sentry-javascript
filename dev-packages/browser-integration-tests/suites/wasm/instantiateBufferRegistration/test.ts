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

sentryTest(
  'registers a module loaded via fetch, arrayBuffer and instantiate under its response url',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (shouldSkipWASMTests(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    await serveWasmFixture(page);
    await page.goto(url);

    const images = await page.evaluate(async () => {
      // @ts-expect-error this function exists
      return window.loadWasmFromBuffer();
    });

    expect(images).toEqual([
      {
        type: 'wasm',
        code_file: 'https://localhost:5887/simple.wasm',
        code_id: '0ba020cdd2444f7eafdd25999a8e9010',
        debug_file: null,
        debug_id: '0ba020cdd2444f7eafdd25999a8e90100',
      },
    ]);
  },
);
