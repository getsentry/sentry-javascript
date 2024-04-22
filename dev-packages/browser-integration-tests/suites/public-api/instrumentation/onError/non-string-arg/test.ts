import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, runScriptInSandbox } from '../../../../../utils/helpers';

sentryTest(
  'should catch onerror calls with non-string first argument gracefully',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    const [, eventData] = await Promise.all([
      runScriptInSandbox(page, {
        content: `
        throw {
          type: 'Error',
          otherKey: 'otherValue',
        };
      `,
      }),
      getFirstSentryEnvelopeRequest<Event>(page),
    ]);

    expect(eventData.exception?.values).toHaveLength(1);
    expect(eventData.exception?.values?.[0]).toMatchObject({
      type: 'Error',
      value: 'Object captured as exception with keys: otherKey, type',
      mechanism: {
        type: 'onerror',
        handled: false,
      },
      stacktrace: {
        frames: expect.any(Array),
      },
    });
  },
);
