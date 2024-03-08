import { expect, test } from '@playwright/test';
import { Event } from '@sentry/types';
import { getMultipleSentryEnvelopeRequests } from './utils/helpers';

const useV2 = process.env.REMIX_VERSION === '2';

test('should report a manually created / finished transaction.', async ({ page }) => {
  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 2, {
    url: '/manual-tracing/0',
    envelopeType: 'transaction',
  });

  const [manualTransactionEnvelope, pageloadEnvelope] = envelopes;

  expect(manualTransactionEnvelope.transaction).toBe('test_transaction_1');
  expect(manualTransactionEnvelope.sdk?.name).toBe('sentry.javascript.remix');
  expect(manualTransactionEnvelope.start_timestamp).toBeDefined();
  expect(manualTransactionEnvelope.timestamp).toBeDefined();

  expect(pageloadEnvelope.contexts?.trace?.op).toBe('pageload');
  expect(pageloadEnvelope.type).toBe('transaction');
  expect(pageloadEnvelope.transaction).toBe(useV2 ? 'routes/manual-tracing.$id' : 'routes/manual-tracing/$id');
});
