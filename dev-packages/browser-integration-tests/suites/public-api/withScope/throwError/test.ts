import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('scope is applied to thrown error', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  const ex = eventData.exception?.values ? eventData.exception.values[0] : undefined;

  expect(eventData.tags).toMatchObject({
    global: 'tag',
    local: 'tag', // this tag is missing :(
  });
  expect(ex?.value).toBe('test error');
});
