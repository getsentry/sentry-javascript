import { expect, test } from '@playwright/test';
import { Event } from '@sentry/types';
import { getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should report a manually captured error.', async ({ page }) => {
  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url: '/capture-exception' });

  const [errorEnvelope, pageloadEnvelope] = envelopes;

  expect(errorEnvelope.level).toBe('error');
  expect(errorEnvelope.transaction).toBe('/capture-exception');
  expect(errorEnvelope.exception?.values).toMatchObject([
    {
      type: 'Error',
      value: 'Sentry Manually Captured Error',
      stacktrace: { frames: expect.any(Array) },
      mechanism: { type: 'generic', handled: true },
    },
  ]);

  expect(pageloadEnvelope.contexts?.trace?.op).toBe('pageload');
  expect(pageloadEnvelope.type).toBe('transaction');
  expect(pageloadEnvelope.transaction).toBe('routes/capture-exception');
});
