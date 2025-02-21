import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('should unset user', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getMultipleSentryEnvelopeRequests<Event>(page, 3, { url });

  expect(eventData[0].message).toBe('no_user');

  // because sendDefaultPii: true
  expect(eventData[0].user).toEqual({ ip_address: '{{auto}}' });

  expect(eventData[1].message).toBe('user');
  expect(eventData[1].user).toEqual({
    id: 'foo',
    ip_address: 'bar',
    other_key: 'baz',
  });

  expect(eventData[2].message).toBe('unset_user');

  // because sendDefaultPii: true
  expect(eventData[2].user).toEqual({
    ip_address: '{{auto}}',
  });
});
