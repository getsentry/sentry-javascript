import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';

// Regression test against https://github.com/getsentry/sentry-javascript/pull/1896
sentryTest('should not contain tslib_1__default', async ({ getLocalTestUrl }) => {
  const tmpDir = await getLocalTestUrl({ testDir: __dirname, skipRouteHandler: true });

  const initBundle = fs.readFileSync(path.join(tmpDir, 'init.bundle.js'), 'utf-8');
  expect(initBundle.length).toBeGreaterThan(0);
  expect(initBundle).not.toContain('tslib_1__default');

  const subjectBundle = fs.readFileSync(path.join(tmpDir, 'subject.bundle.js'), 'utf-8');
  expect(subjectBundle.length).toBeGreaterThan(0);
  expect(subjectBundle).not.toContain('tslib_1__default');
});
