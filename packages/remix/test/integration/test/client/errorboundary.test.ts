import { expect, test } from '@playwright/test';
import { Event } from '@sentry/types';
import { getMultipleSentryEnvelopeRequests } from './utils/helpers';

const useV2 = process.env.REMIX_VERSION === '2';

test('should capture React component errors.', async ({ page }) => {
  const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 2, {
    url: '/error-boundary-capture/0',
  });

  const [pageloadEnvelope, errorEnvelope] = envelopes;

  expect(pageloadEnvelope.contexts?.trace?.op).toBe('pageload');
  expect(pageloadEnvelope.type).toBe('transaction');
  expect(pageloadEnvelope.transaction).toBe(
    useV2 ? 'routes/error-boundary-capture.$id' : 'routes/error-boundary-capture/$id',
  );

  expect(errorEnvelope.level).toBe('error');
  expect(errorEnvelope.sdk?.name).toBe('sentry.javascript.remix');
  expect(errorEnvelope.exception?.values).toMatchObject([
    ...(!useV2
      ? [
          {
            type: 'React ErrorBoundary Error',
            value: 'Sentry React Component Error',
            stacktrace: { frames: expect.any(Array) },
            mechanism: { type: 'chained', handled: false },
          },
        ]
      : []),
    {
      type: 'Error',
      value: 'Sentry React Component Error',
      stacktrace: { frames: expect.any(Array) },
      // In v2 this error will be marked unhandled, in v1 its handled because of LinkedErrors
      // This should be fine though because the error boundary's error is marked unhandled
      mechanism: { type: useV2 ? 'instrument' : 'generic', handled: !useV2 },
    },
  ]);
});
