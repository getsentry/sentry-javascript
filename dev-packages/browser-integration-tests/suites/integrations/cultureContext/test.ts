import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForErrorRequest } from '../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest('cultureContextIntegration captures locale, timezone, and calendar', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const errorRequestPromise = waitForErrorRequest(page);
  await page.goto(url);
  const eventData = envelopeRequestParser(await errorRequestPromise);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData.contexts?.culture).toEqual({
    locale: expect.any(String),
    timezone: expect.any(String),
    calendar: expect.any(String),
  });
});

sentryTest(
  'cultureContextIntegration adds locale, timezone, and calendar to spans',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());
    const url = await getLocalTestUrl({ testDir: __dirname });

    const spanPromise = waitForStreamedSpan(page, span => span.is_segment && getSpanOp(span) === 'pageload');

    await page.goto(url);

    const pageloadSpan = await spanPromise;

    expect(pageloadSpan.attributes['culture.locale']).toEqual({ type: 'string', value: expect.any(String) });
    expect(pageloadSpan.attributes['culture.timezone']).toEqual({ type: 'string', value: expect.any(String) });
    expect(pageloadSpan.attributes['culture.calendar']).toEqual({ type: 'string', value: expect.any(String) });
  },
);
