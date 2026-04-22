import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  hidePage,
  shouldSkipTracingTest,
  waitForClientReportRequest,
} from '../../../../utils/helpers';
import { waitForStreamedSpans } from '../../../../utils/spanUtils';
import type { ClientReport } from '@sentry/core';

sentryTest('ignored child spans are dropped and their children are reparented', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const spansPromise = waitForStreamedSpans(page, spans => !!spans?.find(s => s.name === 'parent-span'));

  const clientReportPromise = waitForClientReportRequest(page);

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const spans = await spansPromise;

  await hidePage(page);

  const clientReport = envelopeRequestParser<ClientReport>(await clientReportPromise);

  const segmentSpanId = spans.find(s => s.name === 'parent-span')?.span_id;

  expect(spans.length).toBe(6);

  expect(spans.some(s => s.name === 'keep-me')).toBe(true);
  expect(spans.some(s => s.name === 'another-keeper')).toBe(true);

  expect(spans.some(s => s.name?.includes('ignore'))).toBe(false);

  const greatGrandChild1 = spans.find(s => s.name === 'great-grandchild-1');
  const grandchild2 = spans.find(s => s.name === 'grandchild-2');
  const greatGreatGreatGrandChild1 = spans.find(s => s.name === 'great-great-great-grandchild-1');

  expect(greatGrandChild1).toBeDefined();
  expect(grandchild2).toBeDefined();
  expect(greatGreatGreatGrandChild1).toBeDefined();

  expect(greatGrandChild1?.parent_span_id).toBe(segmentSpanId);
  expect(grandchild2?.parent_span_id).toBe(segmentSpanId);
  expect(greatGreatGreatGrandChild1?.parent_span_id).toBe(greatGrandChild1?.span_id);

  expect(spans.every(s => s.name === 'parent-span' || !s.is_segment)).toBe(true);

  expect(clientReport.discarded_events).toEqual([
    {
      category: 'span',
      quantity: 5, // 5 ignored child spans
      reason: 'ignored',
    },
  ]);
});
