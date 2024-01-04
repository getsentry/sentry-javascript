import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should set different properties of a scope', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.message).toBe('configured_scope');
  expect(eventData.user).toMatchObject({ id: 'baz' });
  expect(eventData.tags).toMatchObject({ foo: 'bar' });
  expect(eventData.extra).toMatchObject({ qux: 'quux' });
});
