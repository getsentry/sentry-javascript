import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should record multiple extras of different types', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.message).toBe('multiple_extras');
  expect(eventData.extra).toMatchObject({ extra_1: { foo: 'bar', baz: { qux: 'quux' } }, extra_2: false });
});
