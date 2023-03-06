import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('should capture interaction transaction.', async ({ browserName, getLocalTestPath, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  if (!supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestPath({ testDir: __dirname });

  await getFirstSentryEnvelopeRequest<Event>(page, url);

  await page.locator('[data-test-id=interaction-button]').click();

  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 1);
  const eventData = envelopes[0];

  expect(eventData.contexts).toMatchObject({ trace: { op: 'ui.action.click' } });
  expect(eventData.platform).toBe('javascript');
  expect(eventData.type).toBe('transaction');

  expect(eventData.spans).toHaveLength(1);
  const interactionSpan = eventData.spans![0];
  expect(interactionSpan.op).toBe('ui.action.click');
  expect(interactionSpan.description).toBe('body > button');
});

sentryTest('should create only one transaction per interaction', async ({ browserName, getLocalTestPath, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  if (!supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestPath({ testDir: __dirname });

  await getFirstSentryEnvelopeRequest<Event>(page, url);

  for (let i = 0; i < 4; i++) {
    setTimeout(async () => {
      await page.locator('[data-test-id=interaction-button]').click();
    }, i * 100);
  }

  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 4);
  expect(envelopes).toHaveLength(4);

  envelopes.forEach(event => {
    expect(event.spans).toHaveLength(1);
  });
});
