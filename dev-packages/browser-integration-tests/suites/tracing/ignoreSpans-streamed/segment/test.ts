import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  hidePage,
  shouldSkipTracingTest,
  waitForClientReportRequest,
} from '../../../../utils/helpers';
import { observeStreamedSpan, waitForStreamedSpans } from '../../../../utils/spanUtils';
import type { ClientReport } from '@sentry/core';

sentryTest('ignored segment span drops entire trace', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  observeStreamedSpan(page, span => {
    if (span.name === 'ignore-segment' || span.name === 'child-of-ignored-segment') {
      throw new Error('Ignored span found');
    }
    return false; // means we keep on looking for unwanted spans
  });

  const spansPromise = waitForStreamedSpans(page, spans => !!spans?.find(s => s.name === 'normal-segment'));

  const clientReportPromise = waitForClientReportRequest(page);

  await page.goto(url);

  expect((await spansPromise)?.length).toBe(2);

  await hidePage(page);

  const clientReport = envelopeRequestParser<ClientReport>(await clientReportPromise);

  expect(clientReport.discarded_events).toEqual([
    {
      category: 'span',
      quantity: 2, // segment + child span
      reason: 'ignored',
    },
  ]);
});
