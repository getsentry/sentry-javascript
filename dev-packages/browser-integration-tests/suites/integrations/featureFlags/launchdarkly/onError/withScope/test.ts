import { expect } from '@playwright/test';
import type { Scope } from '@sentry/browser';
import { sentryTest } from '../../../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipFeatureFlagsTest,
  waitForErrorRequest,
} from '../../../../../../utils/helpers';

sentryTest('Flag evaluations in forked scopes are stored separately.', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipFeatureFlagsTest()) {
    sentryTest.skip();
  }

  await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestUrl({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  const forkedReqPromise = waitForErrorRequest(page, event => !!event.tags?.isForked === true);
  const mainReqPromise = waitForErrorRequest(page, event => !!event.tags?.isForked === false);

  await page.evaluate(() => {
    const Sentry = (window as any).Sentry;
    const errorButton = document.querySelector('#error') as HTMLButtonElement;
    const ldClient = (window as any).initializeLD();

    ldClient.variation('shared', true);

    Sentry.withScope((scope: Scope) => {
      ldClient.variation('forked', true);
      ldClient.variation('shared', false);
      scope.setTag('isForked', true);
      if (errorButton) {
        errorButton.click();
      }
    });

    ldClient.variation('main', true);
    Sentry.getCurrentScope().setTag('isForked', false);
    errorButton.click();
    return true;
  });

  const forkedReq = await forkedReqPromise;
  const forkedEvent = envelopeRequestParser(forkedReq);

  const mainReq = await mainReqPromise;
  const mainEvent = envelopeRequestParser(mainReq);

  expect(forkedEvent.contexts?.flags?.values).toEqual([
    { flag: 'forked', result: true },
    { flag: 'shared', result: false },
  ]);

  expect(mainEvent.contexts?.flags?.values).toEqual([
    { flag: 'shared', result: true },
    { flag: 'main', result: true },
  ]);
});
