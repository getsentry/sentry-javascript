import { expect, test } from '@playwright/test';
import { Event } from '@sentry/types';
import { getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should report a manually captured message.', async ({ page }) => {
  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url: '/capture-message' });

  const [messageEnvelope, pageloadEnvelope] = envelopes;

  expect(messageEnvelope.level).toBe('info');
  expect(messageEnvelope.message).toBe('Sentry Manually Captured Message');

  expect(pageloadEnvelope.contexts?.trace.op).toBe('pageload');
  expect(pageloadEnvelope.tags?.['routing.instrumentation']).toBe('remix-router');
  expect(pageloadEnvelope.type).toBe('transaction');
  expect(pageloadEnvelope.transaction).toBe('routes/capture-message');
});
