/* eslint-disable no-console */
import type { ConsoleMessage } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';

sentryTest('logs debug messages correctly', async ({ getLocalTestUrl, page }) => {
  const bundleKey = process.env.PW_BUNDLE || '';
  const hasDebug = !bundleKey.includes('_min');

  const url = await getLocalTestUrl({ testDir: __dirname });

  const consoleMessages: string[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    consoleMessages.push(msg.text());
  });

  await page.goto(url);

  await page.evaluate(() => console.log('test log'));

  expect(consoleMessages).toEqual(
    hasDebug
      ? [
          'Sentry Logger [log]: Integration installed: InboundFilters',
          'Sentry Logger [log]: Integration installed: FunctionToString',
          'Sentry Logger [log]: Integration installed: ConversationId',
          'Sentry Logger [log]: Integration installed: BrowserApiErrors',
          'Sentry Logger [log]: Integration installed: Breadcrumbs',
          'Sentry Logger [log]: Global Handler attached: onerror',
          'Sentry Logger [log]: Global Handler attached: onunhandledrejection',
          'Sentry Logger [log]: Integration installed: GlobalHandlers',
          'Sentry Logger [log]: Integration installed: LinkedErrors',
          'Sentry Logger [log]: Integration installed: Dedupe',
          'Sentry Logger [log]: Integration installed: HttpContext',
          'Sentry Logger [warn]: Discarded session because of missing or non-string release',
          'Sentry Logger [log]: Integration installed: BrowserSession',
          'test log',
        ]
      : ['[Sentry] Cannot initialize SDK with `debug` option using a non-debug bundle.', 'test log'],
  );
});
