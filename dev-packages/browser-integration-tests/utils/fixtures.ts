import fs from 'fs';
import path from 'path';
/* eslint-disable no-empty-pattern */
import { test as base } from '@playwright/test';

import { generatePage } from './generatePage';

export const TEST_HOST = 'http://sentry-test.io';

const getAsset = (assetDir: string, asset: string): string => {
  const assetPath = `${assetDir}/${asset}`;

  if (fs.existsSync(assetPath)) {
    return assetPath;
  }

  const parentDirAssetPath = `${path.dirname(assetDir)}/${asset}`;

  if (fs.existsSync(parentDirAssetPath)) {
    return parentDirAssetPath;
  }

  return `utils/defaults/${asset}`;
};

export type TestFixtures = {
  _autoSnapshotSuffix: void;
  testDir: string;
  getLocalTestPath: (options: { testDir: string }) => Promise<string>;
  getLocalTestUrl: (options: { testDir: string; skipRouteHandler?: boolean }) => Promise<string>;
  forceFlushReplay: () => Promise<string>;
  enableConsole: () => void;
  runInChromium: (fn: (...args: unknown[]) => unknown, args?: unknown[]) => unknown;
  runInFirefox: (fn: (...args: unknown[]) => unknown, args?: unknown[]) => unknown;
  runInWebkit: (fn: (...args: unknown[]) => unknown, args?: unknown[]) => unknown;
  runInSingleBrowser: (
    browser: 'chromium' | 'firefox' | 'webkit',
    fn: (...args: unknown[]) => unknown,
    args?: unknown[],
  ) => unknown;
};

const sentryTest = base.extend<TestFixtures>({
  _autoSnapshotSuffix: [
    async ({}, use, testInfo) => {
      testInfo.snapshotSuffix = '';
      await use();
    },
    { auto: true },
  ],

  getLocalTestUrl: ({ page }, use) => {
    return use(async ({ testDir, skipRouteHandler = false }) => {
      const pagePath = `${TEST_HOST}/index.html`;

      await build(testDir);

      // Serve all assets under
      if (!skipRouteHandler) {
        await page.route(`${TEST_HOST}/*.*`, route => {
          const file = route.request().url().split('/').pop();
          const filePath = path.resolve(testDir, `./dist/${file}`);

          return fs.existsSync(filePath) ? route.fulfill({ path: filePath }) : route.continue();
        });
      }

      return pagePath;
    });
  },

  getLocalTestPath: ({}, use) => {
    return use(async ({ testDir }) => {
      const pagePath = `file:///${path.resolve(testDir, './dist/index.html')}`;

      await build(testDir);

      return pagePath;
    });
  },
  runInChromium: ({ runInSingleBrowser }, use) => {
    return use((fn, args) => runInSingleBrowser('chromium', fn, args));
  },
  runInFirefox: ({ runInSingleBrowser }, use) => {
    return use((fn, args) => runInSingleBrowser('firefox', fn, args));
  },
  runInWebkit: ({ runInSingleBrowser }, use) => {
    return use((fn, args) => runInSingleBrowser('webkit', fn, args));
  },
  runInSingleBrowser: ({ browserName }, use) => {
    return use((browser, fn, args = []) => {
      if (browserName !== browser) {
        return;
      }

      return fn(...args);
    });
  },

  forceFlushReplay: ({ page }, use) => {
    return use(() =>
      page.evaluate(`
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: function () {
          return 'hidden';
        },
      });
      document.dispatchEvent(new Event('visibilitychange'));
    `),
    );
  },

  enableConsole: ({ page }, use) => {
    return use(() =>
      // eslint-disable-next-line no-console
      page.on('console', msg => console.log(msg.text())),
    );
  },
});

export { sentryTest };

async function build(testDir: string): Promise<void> {
  const subject = getAsset(testDir, 'subject.js');
  const template = getAsset(testDir, 'template.html');
  const init = getAsset(testDir, 'init.js');

  await generatePage(init, subject, template, testDir);

  const additionalPages = fs
    .readdirSync(testDir)
    .filter(filename => filename.startsWith('page-') && filename.endsWith('.html'));

  for (const pageFilename of additionalPages) {
    // create a new page with the same subject and init as before
    const subject = getAsset(testDir, 'subject.js');
    const pageFile = getAsset(testDir, pageFilename);
    const init = getAsset(testDir, 'init.js');
    await generatePage(init, subject, pageFile, testDir, pageFilename);
  }
}
