import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('should update user', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getMultipleSentryEnvelopeRequests<Event>(page, 2, { url });

  expect(eventData[0].message).toBe('first_user');
  expect(eventData[0].user).toEqual({
    id: 'foo',
    ip_address: 'bar',
  });
  expect(eventData[0].sdk?.settings?.infer_ip).toBe('auto');

  expect(eventData[1].message).toBe('second_user');
  expect(eventData[1].user).toEqual({
    id: 'baz',
  });
  expect(eventData[1].sdk?.settings?.infer_ip).toBe('auto');
});
