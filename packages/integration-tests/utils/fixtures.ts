import { test as base } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { generatePage } from './generatePage';

const getAsset = (assetDir: string, asset: string): string => {
  const assetPath = `${assetDir}/${asset}`;

  if (fs.existsSync(assetPath)) {
    return assetPath;
  }

  const upperDirAssetPath = `${path.dirname(assetDir)}/${asset}`;

  if (fs.existsSync(upperDirAssetPath)) {
    return upperDirAssetPath;
  }

  return `utils/defaults/${asset}`;
};

export type TestOptions = {
  testDir: string;
};

export type TestFixtures = {
  testDir: string;
  getLocalTestPath: (options: TestOptions) => Promise<string>;
};

const sentryTest = base.extend<TestFixtures>({
  // eslint-disable-next-line no-empty-pattern
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
      return pagePath;
    });
  },
});

export { sentryTest };
