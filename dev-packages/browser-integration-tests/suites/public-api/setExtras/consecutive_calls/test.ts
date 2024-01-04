import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should set extras from multiple consecutive calls', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.message).toBe('consecutive_calls');
  expect(eventData.extra).toMatchObject({ extra: [], Infinity: 2, null: null, obj: { foo: ['bar', 'baz', 1] } });
});
