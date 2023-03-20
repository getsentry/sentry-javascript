import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should capture a FID vital.', async ({ browserName, getLocalTestPath, page }) => {
  // FID measurement is not generated on webkit
  if (browserName === 'webkit') {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  // To trigger FID
  await page.click('#fid-btn');

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.fid?.value).toBeDefined();

  const fidSpan = eventData.spans?.filter(({ description }) => description === 'first input delay')[0];

  expect(fidSpan).toBeDefined();
  expect(fidSpan?.op).toBe('ui.action');
  expect(fidSpan?.parentSpanId).toBe(eventData.contexts?.trace_span_id);
});
