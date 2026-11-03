import { expect } from '@playwright/test';
import type { ClientReport } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  hidePage,
  shouldSkipTracingTest,
  waitForClientReportRequest,
} from '../../../../utils/helpers';
import { observeStreamedSpan, waitForStreamedSpans } from '../../../../utils/spanUtils';

sentryTest('attribute-matching ignoreSpans drops the trace', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  observeStreamedSpan(page, span => {
    if (span.name === 'health-check' || span.name === 'child-of-ignored') {
      throw new Error('Ignored span found');
    }
    return false;
  });

  const spansPromise = waitForStreamedSpans(page, spans => !!spans?.find(s => s.name === 'normal-segment'));
  const clientReportPromise = waitForClientReportRequest(page);

  await page.goto(url);

  expect((await spansPromise)?.length).toBe(2);

  await hidePage(page);

  const clientReport = envelopeRequestParser<ClientReport>(await clientReportPromise);
  expect(clientReport.discarded_events).toEqual([{ category: 'span', quantity: 2, reason: 'ignored' }]);
});
