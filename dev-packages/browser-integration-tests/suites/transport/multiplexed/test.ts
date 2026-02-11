import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../utils/helpers';

sentryTest('sends event to DSNs specified in makeMultiplexedTransport', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const errorEvents = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { envelopeType: 'event', url });

  expect(errorEvents).toHaveLength(2);

  const [evt1, evt2] = errorEvents;

  const errorA = evt1?.tags?.to === 'a' ? evt1 : evt2;
  const errorB = evt1?.tags?.to === 'b' ? evt1 : evt2;

  expect(errorA.tags?.to).toBe('a');
  expect(errorB.tags?.to).toBe('b');
});
