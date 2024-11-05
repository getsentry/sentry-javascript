import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getMultipleSentryEnvelopeRequests,
  runScriptInSandbox,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest(
  'should capture an error within a sync startSpan callback',
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
      function run() {
        Sentry.startSpan({ name: 'parent_span' }, () => {
          throw new Error('Sync Error');
        });
      }

      setTimeout(run);
      `,
    });

    const events = await errorEventsPromise;

    const txn = events.find(event => event.type === 'transaction');
    const err = events.find(event => !event.type);

    expect(txn).toMatchObject({ transaction: 'parent_span' });
    expect(err?.exception?.values?.[0]?.value).toBe('Sync Error');
  },
);
