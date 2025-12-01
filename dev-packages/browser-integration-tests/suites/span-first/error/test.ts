import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  runScriptInSandbox,
  shouldSkipTracingTest,
  waitForErrorRequest,
} from '../../../utils/helpers';
import { getSpanOp, waitForV2Spans } from '../../../utils/spanFirstUtils';

sentryTest(
  'puts the pageload span name onto an error event caught during pageload',
  async ({ getLocalTestUrl, page, browserName }) => {
    if (browserName === 'webkit') {
      // This test fails on Webkit as errors thrown from `runScriptInSandbox` are Script Errors and skipped by Sentry
      sentryTest.skip();
    }

    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const errorEventPromise = waitForErrorRequest(page);
    const spanPromise = waitForV2Spans(page, spans => !!spans.find(span => getSpanOp(span) === 'pageload'));

    await page.goto(url);

    await runScriptInSandbox(page, {
      content: `
          throw new Error('Error during pageload');
        `,
    });

    const errorEvent = envelopeRequestParser<Event>(await errorEventPromise);
    const pageloadSpan = (await spanPromise).find(span => getSpanOp(span) === 'pageload');

    expect(pageloadSpan?.attributes?.['sentry.op']?.value).toEqual('pageload');
    expect(errorEvent.exception?.values?.[0]).toBeDefined();

    expect(pageloadSpan?.name).toEqual('/index.html');

    expect(pageloadSpan?.status).toBe('error');
    expect(pageloadSpan?.attributes?.['sentry.idle_span_finish_reason']?.value).toBe('idleTimeout');

    expect(errorEvent.transaction).toEqual(pageloadSpan?.name);
  },
);
