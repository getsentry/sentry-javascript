import { expect } from '@playwright/test';
import { EventEnvelopeHeaders } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { envelopeHeaderRequestParser, getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('should send baggage data in transaction envelope header', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadTransaction = await getFirstSentryEnvelopeRequest<Event>(page, url);
  expect(pageloadTransaction).toBeDefined();

  await page.click('#start-transaction');

  const envHeader = await getFirstSentryEnvelopeRequest<EventEnvelopeHeaders>(page, url, envelopeHeaderRequestParser);

  expect(envHeader.baggage).toBeDefined();
  expect(envHeader.baggage).toEqual(
    'sentry-environment=production,sentry-release=1.0.0,sentry-transaction=test-transaction,sentry-userid=user123,sentry-usersegment=segmentB',
  );
});
