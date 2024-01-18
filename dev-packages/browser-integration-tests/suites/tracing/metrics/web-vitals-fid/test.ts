import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should capture a FID vital.', async ({ browserName, getLocalTestPath, page }) => {
  // FID measurement is not generated on webkit
  if (shouldSkipTracingTest() || browserName === 'webkit') {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  // To trigger FID
  await page.click('#fid-btn');

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page);

  expect(eventData.measurements).toBeDefined();
  expect(eventData.measurements?.fid?.value).toBeDefined();

  // eslint-disable-next-line deprecation/deprecation
  const fidSpan = eventData.spans?.filter(({ description }) => description === 'first input delay')[0];

  expect(fidSpan).toBeDefined();
  // eslint-disable-next-line deprecation/deprecation
  expect(fidSpan?.op).toBe('ui.action');
  // @ts-expect-error this property is not defined on Event
  expect(fidSpan?.parent_span_id).toBe(eventData.contexts?.trace?.span_id);
});
