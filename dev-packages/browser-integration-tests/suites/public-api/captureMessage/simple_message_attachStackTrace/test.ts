import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest(
  'captures a simple message string with stack trace if `attachStackTrace` is `true`',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(eventData.message).toBe('foo');
    expect(eventData.level).toBe('info');
    expect(eventData.exception?.values?.[0]).toEqual({
      mechanism: {
        handled: true,
        type: 'generic',
        synthetic: true,
      },
      stacktrace: {
        frames: expect.arrayContaining([expect.any(Object), expect.any(Object)]),
      },
      value: 'foo',
    });
  },
);
