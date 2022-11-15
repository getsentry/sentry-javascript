import { expect, Route } from '@playwright/test';
import { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('should capture interaction transaction.', async ({ browserName, getLocalTestPath, page }) => {
  if (browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestPath({ testDir: __dirname });

  await getFirstSentryEnvelopeRequest<Event>(page, url);

  await page.locator('[data-test-id=interaction-button]').click();

  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 2);
  const eventData = envelopes[1];

  expect(eventData).toEqual(
    expect.objectContaining({
      contexts: expect.objectContaining({
        trace: expect.objectContaining({
          op: 'ui.action.click',
        }),
      }),
      platform: 'javascript',
      spans: [],
      tags: {},
      type: 'transaction',
    }),
  );
});
