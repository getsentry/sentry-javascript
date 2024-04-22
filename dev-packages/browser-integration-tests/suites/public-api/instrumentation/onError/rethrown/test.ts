import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, runScriptInSandbox } from '../../../../../utils/helpers';

sentryTest(
  'should NOT catch an exception already caught [but rethrown] via Sentry.captureException',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    const [, events] = await Promise.all([
      runScriptInSandbox(page, {
        content: `
          try {
            foo();
          } catch (e) {
            Sentry.captureException(e);
            throw e;
          }
        `,
      }),
      getMultipleSentryEnvelopeRequests<Event>(page, 1),
    ]);

    expect(events[0].exception?.values).toHaveLength(1);
    expect(events[0].exception?.values?.[0]).toMatchObject({
      type: 'ReferenceError',
      // this exact error message varies between browsers, but they should all reference 'foo'
      value: expect.stringContaining('foo'),
      mechanism: {
        type: 'generic',
        handled: true,
      },
      stacktrace: {
        frames: expect.any(Array),
      },
    });
  },
);
