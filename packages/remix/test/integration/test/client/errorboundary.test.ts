import { expect, test } from '@playwright/test';
import type { Event } from '@sentry/core';
import { getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should capture React component errors.', async ({ page }) => {
  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 2, {
    url: '/error-boundary-capture/0',
  });

  const [pageloadEnvelope, errorEnvelope] = envelopes;

  expect(pageloadEnvelope.contexts?.trace?.op).toBe('pageload');
  expect(pageloadEnvelope.type).toBe('transaction');
  expect(pageloadEnvelope.transaction).toBe('/error-boundary-capture/:id');

  expect(errorEnvelope.level).toBe('error');
  expect(errorEnvelope.sdk?.name).toBe('sentry.javascript.remix');
  expect(errorEnvelope.exception?.values).toMatchObject([
    {
      type: 'Error',
      value: 'Sentry React Component Error',
      stacktrace: { frames: expect.any(Array) },
      mechanism: { type: 'instrument', handled: false },
    },
  ]);
  expect(errorEnvelope.transaction).toBe('/error-boundary-capture/:id');

  // The error boundary should be rendered
  expect(await page.textContent('#error-header')).toBe('ErrorBoundary Error');
});
