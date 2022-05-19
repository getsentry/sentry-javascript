import { expect } from '@playwright/test';
import { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeHeaderRequestParser, getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('should send baggage data in transaction envelope header', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const envHeader = await getFirstSentryEnvelopeRequest<EventEnvelopeHeaders>(page, url, envelopeHeaderRequestParser);

  expect(envHeader.trace).toBeDefined();
  expect(envHeader.trace).toEqual({
    environment: 'production',
    transaction: 'testTransactionBaggage',
    userid: 'user123',
    usersegment: 'segmentB',
  });
});
