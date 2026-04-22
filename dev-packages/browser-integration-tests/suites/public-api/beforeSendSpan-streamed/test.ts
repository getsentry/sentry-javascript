import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../utils/spanUtils';

sentryTest('beforeSendSpan applies changes to streamed span', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const pageloadSpanPromise = waitForStreamedSpan(page, span => getSpanOp(span) === 'pageload');

  await page.goto(url);

  const pageloadSpan = await pageloadSpanPromise;

  expect(pageloadSpan.name).toBe('customPageloadSpanName');
  expect(pageloadSpan.links).toEqual([
    {
      context: {
        traceId: '123',
        spanId: '456',
      },
      attributes: {
        'sentry.link.type': { type: 'string', value: 'custom_link' },
      },
    },
  ]);
  expect(pageloadSpan.attributes?.['sentry.custom_attribute']).toEqual({
    type: 'string',
    value: 'customAttributeValue',
  });
  // we allow overriding any kinds of fields on the span, so we have to expect invalid values
  expect(pageloadSpan.status).toBe('something');
});
