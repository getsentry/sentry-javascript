import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should add multiple breadcrumbs', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.breadcrumbs).toHaveLength(2);
  expect(eventData.breadcrumbs?.[0]).toMatchObject({
    category: 'foo',
    message: 'bar',
    level: 'baz',
  });
  expect(eventData.breadcrumbs?.[1]).toMatchObject({
    category: 'qux',
  });
  expect(eventData.message).toBe('test_multi_breadcrumbs');
});
