/* eslint-disable no-console */
import type { ConsoleMessage } from '@playwright/test';
import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';

sentryTest('logs debug messages correctly', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const consoleMessages: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    consoleMessages.push(msg.text());
  });

  await page.goto(url);

  await page.evaluate(() => console.log('test log'));

  expect(consoleMessages).toEqual([
    'Sentry Logger [log]: Integration installed: InboundFilters',
    'Sentry Logger [log]: Integration installed: FunctionToString',
    'Sentry Logger [log]: Integration installed: TryCatch',
    'Sentry Logger [log]: Integration installed: Breadcrumbs',
    'Sentry Logger [log]: Global Handler attached: onerror',
    'Sentry Logger [log]: Global Handler attached: onunhandledrejection',
    'Sentry Logger [log]: Integration installed: GlobalHandlers',
    'Sentry Logger [log]: Integration installed: LinkedErrors',
    'Sentry Logger [log]: Integration installed: Dedupe',
    'Sentry Logger [log]: Integration installed: HttpContext',
    'Sentry Logger [warn]: Discarded session because of missing or non-string release',
    'test log',
  ]);
});
