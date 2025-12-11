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

  const forkedReqPromise = waitForErrorRequest(page, event => !!event.tags && event.tags.isForked === true);
  const mainReqPromise = waitForErrorRequest(page, event => !!event.tags && event.tags.isForked === false);

  await page.evaluate(() => {
    const Sentry = (window as any).Sentry;
    const errorButton = document.querySelector('#error') as HTMLButtonElement;
    const unleash = new (window as any).UnleashClient();

    unleash.isEnabled('strFeat');

    Sentry.withScope((scope: Scope) => {
      unleash.isEnabled('disabledFeat');
      unleash.isEnabled('strFeat');
      scope.setTag('isForked', true);
      if (errorButton) {
        errorButton.click();
      }
    });

    unleash.isEnabled('noPayloadFeat');
    Sentry.getCurrentScope().setTag('isForked', false);
    errorButton.click();
    return true;
  });

  const forkedReq = await forkedReqPromise;
  const forkedEvent = envelopeRequestParser(forkedReq);

  const mainReq = await mainReqPromise;
  const mainEvent = envelopeRequestParser(mainReq);

  expect(forkedEvent.contexts?.flags?.values).toEqual([
    { flag: 'disabledFeat', result: false },
    { flag: 'strFeat', result: true },
  ]);

  expect(mainEvent.contexts?.flags?.values).toEqual([
    { flag: 'strFeat', result: true },
    { flag: 'noPayloadFeat', result: true },
  ]);
});
