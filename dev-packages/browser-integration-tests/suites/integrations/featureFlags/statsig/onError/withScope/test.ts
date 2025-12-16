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
    const client = (window as any).statsigClient;

    client.setMockGateValue('shared', true);
    client.setMockGateValue('main', true);

    client.checkGate('shared');

    Sentry.withScope((scope: Scope) => {
      client.setMockGateValue('forked', true);
      client.setMockGateValue('shared', false); // override the value in the parent scope.

      client.checkGate('forked');
      client.checkGate('shared');
      scope.setTag('isForked', true);
      errorButton.click();
    });

    client.checkGate('main');
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
