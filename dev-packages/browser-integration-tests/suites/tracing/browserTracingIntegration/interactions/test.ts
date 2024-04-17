import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Contexts, Event as SentryEvent, Measurements, SpanJSON } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

type TransactionJSON = SpanJSON & {
  spans: SpanJSON[];
  contexts: Contexts;
  platform: string;
  type: string;
};

const wait = (time: number) => new Promise(res => setTimeout(res, time));

sentryTest('should capture interaction transaction. @firefox', async ({ browserName, getLocalTestPath, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await getFirstSentryEnvelopeRequest<SentryEvent>(page);

  await page.locator('[data-test-id=interaction-button]').click();
  await page.locator('.clicked[data-test-id=interaction-button]').isVisible();

  const envelopes = await getMultipleSentryEnvelopeRequests<TransactionJSON>(page, 1);
  expect(envelopes).toHaveLength(1);

  const eventData = envelopes[0];

  expect(eventData.contexts).toMatchObject({ trace: { op: 'ui.action.click' } });
  expect(eventData.platform).toBe('javascript');
  expect(eventData.type).toBe('transaction');
  expect(eventData.spans).toHaveLength(1);

  const interactionSpan = eventData.spans![0];
  expect(interactionSpan.op).toBe('ui.interaction.click');
  expect(interactionSpan.description).toBe('body > button.clicked');
  expect(interactionSpan.timestamp).toBeDefined();

  const interactionSpanDuration = (interactionSpan.timestamp! - interactionSpan.start_timestamp) * 1000;
  expect(interactionSpanDuration).toBeGreaterThan(65);
  expect(interactionSpanDuration).toBeLessThan(200);
});

sentryTest(
  'should create only one transaction per interaction @firefox',
  async ({ browserName, getLocalTestPath, page }) => {
    const supportedBrowsers = ['chromium', 'firefox'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);
    await getFirstSentryEnvelopeRequest<SentryEvent>(page);

    for (let i = 0; i < 4; i++) {
      await wait(100);
      await page.locator('[data-test-id=interaction-button]').click();
      const envelope = await getMultipleSentryEnvelopeRequests<SentryEvent>(page, 1);
      expect(envelope[0].spans).toHaveLength(1);
    }
  },
);

sentryTest(
  'should use the component name for a clicked element when it is available',
  async ({ browserName, getLocalTestPath, page }) => {
    const supportedBrowsers = ['chromium', 'firefox'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await getFirstSentryEnvelopeRequest<SentryEvent>(page);

    await page.locator('[data-test-id=annotated-button]').click();

    const envelopes = await getMultipleSentryEnvelopeRequests<TransactionJSON>(page, 1);
    expect(envelopes).toHaveLength(1);
    const eventData = envelopes[0];

    expect(eventData.spans).toHaveLength(1);

    const interactionSpan = eventData.spans![0];
    expect(interactionSpan.op).toBe('ui.interaction.click');
    expect(interactionSpan.description).toBe('body > AnnotatedButton');
  },
);

sentryTest('should capture an INP click event span. @firefox', async ({ browserName, getLocalTestPath, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

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
  await getFirstSentryEnvelopeRequest<SentryEvent>(page);

  await page.locator('[data-test-id=interaction-button]').click();
  await page.locator('.clicked[data-test-id=interaction-button]').isVisible();

  // Wait for the interaction transaction from the enableInteractions experiment
  await getMultipleSentryEnvelopeRequests<TransactionJSON>(page, 1);

  const spanEnvelopesPromise = getMultipleSentryEnvelopeRequests<
    SpanJSON & { exclusive_time: number; measurements: Measurements }
  >(page, 1, {
    envelopeType: 'span',
  });
  // Page hide to trigger INP
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
  });

  // Get the INP span envelope
  const spanEnvelopes = await spanEnvelopesPromise;

  expect(spanEnvelopes).toHaveLength(1);
  expect(spanEnvelopes[0].op).toBe('ui.interaction.click');
  expect(spanEnvelopes[0].description).toBe('body > button.clicked');
  expect(spanEnvelopes[0].exclusive_time).toBeGreaterThan(0);
  expect(spanEnvelopes[0].measurements.inp.value).toBeGreaterThan(0);
  expect(spanEnvelopes[0].measurements.inp.unit).toBe('millisecond');
});
