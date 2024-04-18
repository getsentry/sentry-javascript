import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event as SentryEvent, SpanJSON } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest('should capture an INP click event span.', async ({ browserName, getLocalTestPath, page }) => {
  const supportedBrowsers = ['chromium'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));
  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await getFirstSentryEnvelopeRequest<SentryEvent>(page); // wait for page load

  const spanEnvelopesPromise = getMultipleSentryEnvelopeRequests<SpanJSON>(page, 1, {
    // envelopeType: 'span', // todo: does not work with envelopType
  });

  await page.locator('[data-test-id=interaction-button]').click();
  await page.locator('.clicked[data-test-id=interaction-button]').isVisible();

  // eslint-disable-next-line no-console
  console.log('buttons clicked');

  // Page hide to trigger INP
  await page.evaluate(() => {
    // eslint-disable-next-line no-console
    console.log('dispatching event');
    window.dispatchEvent(new Event('pagehide'));
  });

  // eslint-disable-next-line no-console
  console.log('event dispatched');

  // Get the INP span envelope
  const spanEnvelopes = await spanEnvelopesPromise;

  // eslint-disable-next-line no-console
  console.log('waited for envelope');

  // expect(spanEnvelopes).toBe(1);

  expect(spanEnvelopes).toHaveLength(1);
  expect(spanEnvelopes[0].op).toBe('ui.interaction.click');
  expect(spanEnvelopes[0].description).toBe('body > button.clicked');
  expect(spanEnvelopes[0].exclusive_time).toBeGreaterThan(0);
  expect(spanEnvelopes[0].measurements?.inp.value).toBeGreaterThan(0);
  expect(spanEnvelopes[0].measurements?.inp.unit).toBe('millisecond');
});

sentryTest(
  'should choose the slowest interaction click event when INP is triggered.',
  async ({ browserName, getLocalTestPath, page }) => {
    const supportedBrowsers = ['chromium'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );
    await page.route('https://dsn.ingest.sentry.io/**/*', route => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-id' }),
      });
    });

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await getFirstSentryEnvelopeRequest<SentryEvent>(page);

    const spanEnvelopesPromise = getMultipleSentryEnvelopeRequests<SpanJSON>(page, 1, {
      // envelopeType: 'span',
    });

    await page.locator('[data-test-id=interaction-button]').click();
    await page.locator('.clicked[data-test-id=interaction-button]').isVisible();

    // eslint-disable-next-line no-console
    console.log('2 - clicked first time');

    await page.locator('[data-test-id=slow-interaction-button]').click();
    await page.locator('.clicked[data-test-id=slow-interaction-button]').isVisible();

    // eslint-disable-next-line no-console
    console.log('2 - clicked second time');

    // Page hide to trigger INP
    await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    // eslint-disable-next-line no-console
    console.log('2 - dispatched event');

    // Get the INP span envelope
    const spanEnvelopes = await spanEnvelopesPromise;

    // expect(spanEnvelopes).toBe(2);
    expect(spanEnvelopes).toHaveLength(1);
    expect(spanEnvelopes[0].op).toBe('ui.interaction.click');
    expect(spanEnvelopes[0].description).toBe('body > button.clicked');
    expect(spanEnvelopes[0].exclusive_time).toBeGreaterThan(150);
    expect(spanEnvelopes[0].measurements?.inp.value).toBeGreaterThan(150);
    expect(spanEnvelopes[0].measurements?.inp.unit).toBe('millisecond');
  },
);
