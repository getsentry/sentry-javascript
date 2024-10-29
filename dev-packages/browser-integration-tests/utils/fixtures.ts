import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
/* eslint-disable no-empty-pattern */
import { test as base } from '@playwright/test';

import { SDK_VERSION } from '@sentry/browser';
import { generatePage } from './generatePage';

export const TEST_HOST = 'http://sentry-test.io';

const getAsset = (assetDir: string, asset: string): string => {
  const assetPath = `${assetDir}/${asset}`;

  // Try to find the asset in the same directory
  if (fs.existsSync(assetPath)) {
    return assetPath;
  }

  // Else, try to find it in the parent directory
  const parentDirAssetPath = `${path.dirname(assetDir)}/${asset}`;

  if (fs.existsSync(parentDirAssetPath)) {
    return parentDirAssetPath;
  }

  // Else use a static asset
  return `utils/defaults/${asset}`;
};

export type TestFixtures = {
  _autoSnapshotSuffix: void;
  testDir: string;
  getLocalTestPath: (options: { testDir: string; skipDsnRouteHandler?: boolean }) => Promise<string>;
  getLocalTestUrl: (options: {
    testDir: string;
    skipRouteHandler?: boolean;
    skipDsnRouteHandler?: boolean;
  }) => Promise<string>;
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
    return use(async ({ testDir, skipRouteHandler = false, skipDsnRouteHandler = false }) => {
      const pagePath = `${TEST_HOST}/index.html`;

      const tmpDir = path.join(testDir, 'dist', crypto.randomUUID());

      await build(testDir, tmpDir);

      // If skipping route handlers we return the tmp dir instead of adding the handler
      // This way, this can be handled by the caller manually
      if (skipRouteHandler) {
        return tmpDir;
      }

      if (!skipDsnRouteHandler) {
        await page.route('https://dsn.ingest.sentry.io/**/*', route => {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'test-id' }),
          });
        });
      }

      await page.route(`${TEST_HOST}/*.*`, route => {
        const file = route.request().url().split('/').pop();
        const filePath = path.resolve(tmpDir, `./${file}`);

        return fs.existsSync(filePath) ? route.fulfill({ path: filePath }) : route.continue();
      });

      // Ensure feedback can be lazy loaded
      await page.route(`https://browser.sentry-cdn.com/${SDK_VERSION}/feedback-modal.min.js`, route => {
        const filePath = path.resolve(tmpDir, './feedback-modal.bundle.js');
        if (!fs.existsSync(filePath)) {
          throw new Error(`Feedback modal bundle (${filePath}) not found`);
        }
        return route.fulfill({ path: filePath });
      });

      await page.route(`https://browser.sentry-cdn.com/${SDK_VERSION}/feedback-screenshot.min.js`, route => {
        const filePath = path.resolve(tmpDir, './feedback-screenshot.bundle.js');
        if (!fs.existsSync(filePath)) {
          throw new Error(`Feedback screenshot bundle (${filePath}) not found`);
        }
        return route.fulfill({ path: filePath });
      });

      return pagePath;
    });
  },

  getLocalTestPath: ({ page }, use) => {
    return use(async ({ testDir, skipDsnRouteHandler }) => {
      const tmpDir = path.join(testDir, 'dist', crypto.randomUUID());
      const pagePath = `file:///${path.resolve(tmpDir, './index.html')}`;

      await build(testDir, tmpDir);

      if (!skipDsnRouteHandler) {
        await page.route('https://dsn.ingest.sentry.io/**/*', route => {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'test-id' }),
          });
        });
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

async function build(testDir: string, tmpDir: string): Promise<void> {
  const subject = getAsset(testDir, 'subject.js');
  const template = getAsset(testDir, 'template.html');
  const init = getAsset(testDir, 'init.js');

  await generatePage(init, subject, template, tmpDir);

  const additionalPages = fs
    .readdirSync(testDir)
    .filter(filename => filename.startsWith('page-') && filename.endsWith('.html'));

  for (const pageFilename of additionalPages) {
    // create a new page with the same subject and init as before
    const subject = getAsset(testDir, 'subject.js');
    const pageFile = getAsset(testDir, pageFilename);
    const init = getAsset(testDir, 'init.js');
    await generatePage(init, subject, pageFile, tmpDir, pageFilename);
  }
}
