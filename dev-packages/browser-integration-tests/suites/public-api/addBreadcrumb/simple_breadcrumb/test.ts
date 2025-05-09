import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should add a simple breadcrumb', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.breadcrumbs).toHaveLength(1);
  expect(eventData.breadcrumbs?.[0]).toMatchObject({
    category: 'foo',
    message: 'bar',
    level: 'baz',
  });
  expect(eventData.message).toBe('test');
});
