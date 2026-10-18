import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpanEnvelope } from '../../../../utils/spanUtils';

sentryTest('infers user IP and user agent on streamed spans by default', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });
  const envelopePromise = waitForStreamedSpanEnvelope(page, envelope =>
    envelope[1][0][1].items.some(span => span.is_segment && span.name === 'woot'),
  );
  await page.goto(url);

  const envelope = await envelopePromise;
  expect(envelope[1][0][1].ingest_settings).toEqual({ infer_ip: 'auto', infer_user_agent: 'auto' });
});
