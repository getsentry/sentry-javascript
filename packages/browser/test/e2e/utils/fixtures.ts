import { test as base } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { generatePage } from './generatePage';

const getAsset = function(assetDir: string, asset: string) {
  if (fs.existsSync(`${assetDir}/${asset}`)) {
    return `${assetDir}/${asset}`;
  } else {
    return `${path.dirname(assetDir)}/${asset}`;
  }
};

export type TestOptions = {
  testDir: string;
};

export type TestFixtures = {
  testDir: string;
  getLocalTestPath: (options: TestOptions) => Promise<string>;
};

const sentryTest = base.extend<TestFixtures>({
  getLocalTestPath: ({}, use, testInfo) => {
    return use(async ({ testDir }) => {
      const pagePath = `file:///${path.resolve(testDir, './dist/index.html')}`;

      // Build test page if it doesn't exist
      if (!fs.existsSync(pagePath)) {
        const testDir = path.dirname(testInfo.file);
        const subject = getAsset(testDir, 'subject.js');
        const template = getAsset(testDir, 'template.hbs');
        const init = getAsset(testDir, 'init.js');

        await generatePage(init, subject, template, testDir);
      }
      return pagePath;
    });
  },
});

export { sentryTest };
