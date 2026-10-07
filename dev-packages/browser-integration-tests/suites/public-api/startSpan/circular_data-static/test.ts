import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import {
  envelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../../utils/helpers';

sentryTest(
  'normalizes circular attributes on root and child spans with static tracing',
  async ({ getLocalTestUrl, page }) => {
    sentryTest.skip(shouldSkipTracingTest());
    const url = await getLocalTestUrl({ testDir: __dirname });
    const event = envelopeRequestParser(await waitForTransactionRequestOnUrl(page, url));

    expect(event.transaction).toBe('circular_object_test_transaction');
    expect(event.contexts?.trace?.data).toMatchObject({
      chicken: { lays: { contains: '[Circular ~]' } },
      count: 42,
    });
    expect(event.spans).toHaveLength(1);
    expect(event.spans?.[0]).toMatchObject({
      op: 'circular_object_test_span',
      parent_span_id: event.contexts?.trace?.span_id,
      data: { chicken: { lays: { contains: '[Circular ~]' } }, count: 42 },
    });
  },
);
