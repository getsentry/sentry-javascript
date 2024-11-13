import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';

import { envelopeRequestParser, waitForErrorRequest } from '../../../../../utils/helpers';

import type { Scope } from '@sentry/browser';

sentryTest('Flag evaluations in forked scopes are stored separately.', async ({ getLocalTestPath, page }) => {
  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  const forkedReqPromise = waitForErrorRequest(page, event => !!event.tags && event.tags.isForked === true);
  const mainReqPromise = waitForErrorRequest(page, event => !!event.tags && event.tags.isForked === false);

  const hasButton = await page.evaluate(() => {
    const Sentry = (window as any).Sentry;
    const errorButton = document.querySelector('#error');
    if (!(errorButton instanceof HTMLButtonElement)) {
      return false;
    }
    const ldClient = (window as any).initializeLD();

    ldClient.variation('shared', true);

    Sentry.withScope((scope: Scope) => {
      ldClient.variation('forked', true);
      ldClient.variation('shared', false);
      scope.setTag('isForked', true);
      errorButton.click();
    });

    ldClient.variation('main', true);
    Sentry.getCurrentScope().setTag('isForked', false);
    errorButton.click();
    return true;
  });

  if (!hasButton) {
    throw new Error('Expected template to have a button that throws an error')
  }

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
