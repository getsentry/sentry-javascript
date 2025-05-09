import { expect } from '@playwright/test';
import type { Event as SentryEvent } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  getMultipleSentryEnvelopeRequests,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest('should capture interaction transaction. @firefox', async ({ browserName, getLocalTestUrl, page }) => {
  const supportedBrowsers = ['chromium', 'firefox'];

  if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
    sentryTest.skip();
  }
  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);
  await getFirstSentryEnvelopeRequest<SentryEvent>(page);

  const envelopesPromise = getMultipleSentryEnvelopeRequests<SentryEvent>(page, 1);

  await page.locator('[data-test-id=interaction-button]').click();
  await page.locator('.clicked[data-test-id=interaction-button]').isVisible();

  const envelopes = await envelopesPromise;

  expect(envelopes).toHaveLength(1);

  const eventData = envelopes[0];

  expect(eventData.contexts).toMatchObject({ trace: { op: 'ui.action.click' } });
  expect(eventData.platform).toBe('javascript');
  expect(eventData.type).toBe('transaction');

  const spans = eventData.spans?.filter(span => !span.op?.startsWith('ui.long-animation-frame'));
  expect(spans).toHaveLength(1);

  const interactionSpan = spans![0];
  expect(interactionSpan.op).toBe('ui.interaction.click');
  expect(interactionSpan.description).toBe('body > button.clicked');
  expect(interactionSpan.timestamp).toBeDefined();

  const interactionSpanDuration = (interactionSpan.timestamp! - interactionSpan.start_timestamp) * 1000;
  expect(interactionSpanDuration).toBeGreaterThan(65);
  expect(interactionSpanDuration).toBeLessThan(200);
});

sentryTest(
  'should create only one transaction per interaction @firefox',
  async ({ browserName, getLocalTestUrl, page }) => {
    const supportedBrowsers = ['chromium', 'firefox'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });
    await page.goto(url);
    await getFirstSentryEnvelopeRequest<SentryEvent>(page);

    for (let i = 0; i < 4; i++) {
      const envelopePromise = getMultipleSentryEnvelopeRequests<SentryEvent>(page, 1);
      await page.waitForTimeout(1000);
      await page.locator('[data-test-id=interaction-button]').click();
      const envelope = await envelopePromise;
      const spans = envelope[0].spans?.filter(span => !span.op?.startsWith('ui.long-animation-frame'));
      expect(spans).toHaveLength(1);
    }
  },
);

sentryTest(
  'should use the component name for a clicked element when it is available',
  async ({ browserName, getLocalTestUrl, page }) => {
    const supportedBrowsers = ['chromium', 'firefox'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    await getFirstSentryEnvelopeRequest<SentryEvent>(page);

    const envelopePromise = getMultipleSentryEnvelopeRequests<SentryEvent>(page, 1);

    await page.locator('[data-test-id=annotated-button]').click();

    const envelopes = await envelopePromise;
    expect(envelopes).toHaveLength(1);
    const eventData = envelopes[0];
    const spans = eventData.spans?.filter(span => !span.op?.startsWith('ui.long-animation-frame'));
    expect(spans).toHaveLength(1);

    const interactionSpan = spans![0];
    expect(interactionSpan.op).toBe('ui.interaction.click');
    expect(interactionSpan.description).toBe('body > AnnotatedButton');
  },
);

sentryTest(
  'should use the element name for a clicked element when no component name',
  async ({ browserName, getLocalTestUrl, page }) => {
    const supportedBrowsers = ['chromium', 'firefox'];

    if (shouldSkipTracingTest() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);
    await getFirstSentryEnvelopeRequest<SentryEvent>(page);

    const envelopesPromise = getMultipleSentryEnvelopeRequests<SentryEvent>(page, 1);

    await page.locator('[data-test-id=styled-button]').click();

    const envelopes = await envelopesPromise;
    expect(envelopes).toHaveLength(1);

    const eventData = envelopes[0];
    const spans = eventData.spans?.filter(span => !span.op?.startsWith('ui.long-animation-frame'));
    expect(spans).toHaveLength(1);

    const interactionSpan = spans![0];
    expect(interactionSpan.op).toBe('ui.interaction.click');
    expect(interactionSpan.description).toBe('body > StyledButton');
  },
);
