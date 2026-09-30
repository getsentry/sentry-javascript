import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  waitForErrorRequest,
  runScriptInSandbox,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';
import { waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest(
  'should capture an error within a sync startSpan callback',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (browserName === 'webkit') {
      // This test fails on Webkit as errors thrown from `runScriptInSandbox` are Script Errors and skipped by Sentry
      sentryTest.skip();
    }

    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const spanPromise = waitForStreamedSpan(page, span => span.name === 'parent_span');
    const errorPromise = waitForErrorRequest(page);

    await page.goto(url);

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

    const [span, errorRequest] = await Promise.all([spanPromise, errorPromise]);
    const err = envelopeRequestParser(errorRequest);

    expect(span.name).toBe('parent_span');
    expect(span.status).toBe('error');
    expect(err?.exception?.values?.[0]?.value).toBe('Sync Error');
  },
);
