import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest(
  'Instrumentation does not fail when using frozen callback for setTimeout',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const logMessages: string[] = [];

    page.on('console', msg => {
      logMessages.push(msg.text());
    });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    // It still captures the error
    expect(eventData.exception?.values).toHaveLength(1);
    expect(eventData.exception?.values?.[0]).toMatchObject({
      type: 'Error',
      value: 'setTimeout_error',
      mechanism: {
        type: 'instrument',
        handled: false,
      },
      stacktrace: {
        frames: expect.any(Array),
      },
    });

    expect(logMessages).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'Sentry Logger [log]: Failed to add non-enumerable property "__sentry_wrapped__" to object function callback()',
        ),
      ]),
    );
  },
);
