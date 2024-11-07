import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getMultipleSentryEnvelopeRequests,
  runScriptInSandbox,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest(
  'should put the pageload transaction name onto an error event caught during pageload',
  async ({ getLocalTestPath, page, browserName }) => {
    if (browserName === 'webkit') {
      // This test fails on Webkit as errors thrown from `runScriptInSandbox` are Script Errors and skipped by Sentry
      sentryTest.skip();
    }

    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    const errorEventsPromise = getMultipleSentryEnvelopeRequests<Event>(page, 2);

    await runScriptInSandbox(page, {
      content: `
          throw new Error('Error during pageload');
        `,
    });

    const [e1, e2] = await errorEventsPromise;

    const pageloadTxnEvent = e1.type === 'transaction' ? e1 : e2;
    const errorEvent = e1.type === 'transaction' ? e2 : e1;

    expect(pageloadTxnEvent.contexts?.trace?.op).toEqual('pageload');
    expect(pageloadTxnEvent.spans?.length).toBeGreaterThan(0);
    expect(errorEvent.exception?.values?.[0]).toBeDefined();

    expect(pageloadTxnEvent.transaction?.endsWith('index.html')).toBe(true);

    expect(errorEvent.transaction).toEqual(pageloadTxnEvent.transaction);
  },
);
