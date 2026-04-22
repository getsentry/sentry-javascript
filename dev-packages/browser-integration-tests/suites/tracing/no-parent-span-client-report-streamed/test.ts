import { expect } from '@playwright/test';
import type { ClientReport } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  envelopeRequestParser,
  hidePage,
  shouldSkipTracingTest,
  waitForClientReportRequest,
} from '../../../utils/helpers';

sentryTest(
  'records no_parent_span client report for fetch requests without an active span',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());

    await page.route('http://sentry-test-site.example/api/test', route => {
      route.fulfill({
        status: 200,
        body: 'ok',
        headers: { 'Content-Type': 'text/plain' },
      });
    });

    const url = await getLocalTestUrl({ testDir: __dirname });

    const clientReportPromise = waitForClientReportRequest(page, report => {
      return report.discarded_events.some(e => e.reason === 'no_parent_span');
    });

    await page.goto(url);

    await hidePage(page);

    const clientReport = envelopeRequestParser<ClientReport>(await clientReportPromise);

    expect(clientReport.discarded_events).toEqual([
      {
        category: 'span',
        quantity: 1,
        reason: 'no_parent_span',
      },
    ]);
  },
);
