import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, runScriptInSandbox } from '../../../../../utils/helpers';

sentryTest(
  'should NOT catch an exception already caught [but rethrown] via Sentry.captureException',
  async ({ getLocalTestPath, page, browserName }) => {
    if (browserName === 'webkit') {
      // This test fails on Webkit as errors thrown from `runScriptInSandbox` are Script Errors and skipped by Sentry
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);

    const errorEventsPromise = getMultipleSentryEnvelopeRequests<Event>(page, 2);

    await runScriptInSandbox(page, {
      content: `
      try {
        try {
          foo();
        } catch (e) {
          Sentry.captureException(e);
          throw e; // intentionally re-throw
        }
      } catch (e) {
        // simulate window.onerror without generating a Script error
        window.onerror('error', 'file.js', 1, 1, e);
      }

      Sentry.captureException(new Error('error 2'));
    `,
    });

    const events = await errorEventsPromise;

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

    // This is not a refernece error, but another generic error
    expect(events[1].exception?.values).toHaveLength(1);
    expect(events[1].exception?.values?.[0]).toMatchObject({
      type: 'Error',
      value: 'error 2',
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
