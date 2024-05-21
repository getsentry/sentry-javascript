import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import type { EventAndTraceHeader } from '../../../../utils/helpers';
import {
  eventAndTraceHeaderRequestParser,
  getFirstSentryEnvelopeRequest,
  shouldSkipTracingTest,
} from '../../../../utils/helpers';

sentryTest('should create a new trace if `startNewTrace` is called', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('http://example.com/**', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  const [pageloadEvent, pageloadTraceHeaders] = await getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    url,
    eventAndTraceHeaderRequestParser,
  );

  const pageloadTraceContext = pageloadEvent.contexts?.trace;

  expect(pageloadEvent.type).toEqual('transaction');

  expect(pageloadTraceContext).toMatchObject({
    op: 'pageload',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });
  expect(pageloadTraceContext).not.toHaveProperty('parent_span_id');

  expect(pageloadTraceHeaders).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: pageloadTraceContext?.trace_id,
  });

  const customTransactionPromise = getFirstSentryEnvelopeRequest<EventAndTraceHeader>(
    page,
    undefined,
    eventAndTraceHeaderRequestParser,
  );

  await page.locator('#fetchBtn').click();

  const [customTransactionEvent, customTransactionTraceHeaders] = await customTransactionPromise;

  expect(customTransactionEvent.type).toEqual('transaction');
  expect(customTransactionEvent.transaction).toEqual('fetch click');

  const customTransactionTraceContext = customTransactionEvent.contexts?.trace;
  expect(customTransactionTraceContext).toMatchObject({
    op: 'ui.interaction.click',
    trace_id: expect.stringMatching(/^[0-9a-f]{32}$/),
    span_id: expect.stringMatching(/^[0-9a-f]{16}$/),
  });

  expect(customTransactionTraceHeaders).toEqual({
    environment: 'production',
    public_key: 'public',
    sample_rate: '1',
    sampled: 'true',
    trace_id: customTransactionTraceContext?.trace_id,
    transaction: 'fetch click',
  });

  expect(customTransactionTraceContext?.trace_id).not.toEqual(pageloadTraceContext?.trace_id);
});
