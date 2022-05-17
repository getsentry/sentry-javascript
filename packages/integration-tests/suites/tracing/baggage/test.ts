import { expect } from '@playwright/test';
import { Event, EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeHeaderRequestParser, getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('should send baggage data in transaction envelope header', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const envHeader = await getFirstSentryEnvelopeRequest<EventEnvelopeHeaders>(page, url, envelopeHeaderRequestParser);

  expect(envHeader.baggage).toBeDefined();
  expect(envHeader.baggage).toEqual(
    'sentry-environment=production,sentry-transaction=testTransactionBaggage,sentry-userid=user123,sentry-usersegment=segmentB',
  );
});
