import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should be able to handle circular data', async ({ getLocalTestPath, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.type).toBe('transaction');
  expect(eventData.transaction).toBe('circular_object_test_transaction');

  expect(eventData.contexts).toMatchObject({
    trace: {
      data: { chicken: { lays: { contains: '[Circular ~]' } } },
    },
  });

  expect(eventData?.spans?.[0]).toMatchObject({
    data: { chicken: { lays: { contains: '[Circular ~]' } } },
    op: 'circular_object_test_span',
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
});
