import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should set primitive tags', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.message).toBe('primitive_tags');
  expect(eventData.tags).toMatchObject({
    tag_1: 'foo',
    tag_2: 3.141592653589793,
    tag_3: false,
    tag_4: null,
    tag_6: -1,
  });
});
