import { expect } from '@playwright/test';
import { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeHeaderRequestParser, getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('should send trace context data in transaction envelope header', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const envHeader = await getFirstSentryEnvelopeRequest<EventEnvelopeHeaders>(page, url, envelopeHeaderRequestParser);

  expect(envHeader.trace).toBeDefined();
  expect(envHeader.trace).toMatchObject({
    environment: 'production',
    // TODO comment back in once we properly support transaction and user data in Baggage
    // transaction: 'testTransactionBaggage',
    // user: {
    //   id: 'user123',
    //   segment: 'segmentB',
    // },
    public_key: 'public',
    trace_id: expect.any(String),
  });
});
