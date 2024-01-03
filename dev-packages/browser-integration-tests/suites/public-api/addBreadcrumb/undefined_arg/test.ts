import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest(
  'should add an empty breadcrumb initialized with a timestamp, when no argument is given',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(eventData.breadcrumbs).toHaveLength(1);
    expect(eventData.breadcrumbs?.[0]).toMatchObject({
      timestamp: expect.any(Number),
    });

    expect(eventData.message).toBe('test_undefined_arg');
  },
);
