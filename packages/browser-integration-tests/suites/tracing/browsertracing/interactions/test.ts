import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event, Span, SpanContext, Transaction } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

type TransactionJSON = ReturnType<Transaction['toJSON']> & {
  spans: ReturnType<Span['toJSON']>[];
  contexts: SpanContext;
  platform: string;
  type: string;
};

const wait = (time: number) => new Promise(res => setTimeout(res, time));

sentryTest(
  'should capture interaction transaction.',
  async ({ browserName, getLocalTestPath, page, isTracingCapableBundle }) => {
    const supportedBrowsers = ['chromium', 'firefox'];

    if (!isTracingCapableBundle() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await getFirstSentryEnvelopeRequest<Event>(page);

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
    expect(interactionSpanDuration).toBeGreaterThan(70);
    expect(interactionSpanDuration).toBeLessThan(200);
  },
);

sentryTest(
  'should create only one transaction per interaction',
  async ({ browserName, getLocalTestPath, page, isTracingCapableBundle }) => {
    const supportedBrowsers = ['chromium', 'firefox'];

    if (!isTracingCapableBundle() || !supportedBrowsers.includes(browserName)) {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestPath({ testDir: __dirname });
    await page.goto(url);
    await getFirstSentryEnvelopeRequest<Event>(page);

    for (let i = 0; i < 4; i++) {
      await wait(100);
      await page.locator('[data-test-id=interaction-button]').click();
      const envelope = await getMultipleSentryEnvelopeRequests<Event>(page, 1);
      expect(envelope[0].spans).toHaveLength(1);
    }
  },
);
