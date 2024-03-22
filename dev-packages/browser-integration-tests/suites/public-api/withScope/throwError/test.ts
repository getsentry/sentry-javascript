import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

/**
 * Why does this test exist?
 *
 * We recently discovered that errors caught by global handlers will potentially loose scope data from the active scope
 * where the error was thrown in. The simple example in this test (see subject.ts) demonstrates this behavior (in a
 * browser environment but the same behavior applies to the server; see the test there).
 *
 * This test nevertheless covers the behavior so that we're aware.
 */
sentryTest(
  'withScope scope is NOT applied to thrown error caught by global handler',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    const ex = eventData.exception?.values ? eventData.exception.values[0] : undefined;

    // This tag is missing :(
    expect(eventData.tags?.local).toBeUndefined();

    expect(eventData.tags).toMatchObject({
      global: 'tag',
    });
    expect(ex?.value).toBe('test error');
  },
);
