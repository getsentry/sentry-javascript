/* eslint-disable no-empty-pattern */
import { test as base } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { generatePage } from './generatePage';

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

  getLocalTestPath: ({}, use, testInfo) => {
    return use(async ({ testDir }) => {
      const pagePath = `file:///${path.resolve(testDir, './dist/index.html')}`;

      // Build test page if it doesn't exist
      if (!fs.existsSync(pagePath)) {
        const testDir = path.dirname(testInfo.file);
        const subject = getAsset(testDir, 'subject.js');
        const template = getAsset(testDir, 'template.html');
        const init = getAsset(testDir, 'init.js');

        await generatePage(init, subject, template, testDir);
      }

      const additionalPages = fs
        .readdirSync(testDir)
        .filter(filename => filename.startsWith('page-') && filename.endsWith('.html'));

      const outDir = path.dirname(testInfo.file);
      for (const pageFilename of additionalPages) {
        // create a new page with the same subject and init as before
        const subject = getAsset(testDir, 'subject.js');
        const pageFile = getAsset(testDir, pageFilename);
        const init = getAsset(testDir, 'init.js');
        await generatePage(init, subject, pageFile, outDir, pageFilename);
      }

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
});

export { sentryTest };
