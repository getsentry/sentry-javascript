import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';

import { envelopeRequestParser, waitForErrorRequest } from '../../../../utils/helpers';
import type { LDContext, LDOptions, LDFlagValue, LDClient, LDEvaluationDetail } from 'launchdarkly-js-client-sdk';
import type { Event } from '@sentry/types';

// const MockLaunchDarkly = { //TODO: remove in favor of window.MockLaunchDarkly from init.js
//   initialize(
//     _clientId: string,
//     context: LDContext,
//     options: LDOptions,
//   ) {
//     const flagUsedHandler = options?.inspectors?.[0].method;
//     const wellTypedHandler = flagUsedHandler as ((
//       flagKey: string,
//       flagDetail: LDEvaluationDetail,
//       context: LDContext,
//     ) => void) | undefined;

//     return {
//       variation(key: string, defaultValue: LDFlagValue) {
//         wellTypedHandler?.(key, { value: defaultValue }, context);
//         return defaultValue;
//       },
//     };
//   },
// };

sentryTest('e2e test', async ({ getLocalTestPath, page }) => {
  let errorEventId: string = 'invalid_id';
  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    const event = envelopeRequestParser(route.request());
    // error events have no type field
    if (event && !event.type && event.event_id) {
      errorEventId = event.event_id;
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  // TODO: could this be in init.js?
  await page.waitForFunction(() => {
    const ldClient = (window as any).InitializeLD();
    ldClient.variation('feat1', false);
    ldClient.variation('feat2', false);
    ldClient.variation('feat3', false);
    ldClient.variation('feat2', true);
    return true;
  });


  // TODO: eviction not tested

  // trigger error
  const reqPromise = waitForErrorRequest(page);
  await page.locator('#error').click();
  const req = await reqPromise;

  // console.log(errorEventId);
  const event = envelopeRequestParser(req);

  expect(event.contexts?.flags?.values).toEqual([
    { flag: 'feat1', result: false },
    { flag: 'feat3', result: false },
    { flag: 'feat2', result: true },
  ]);
});
