import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, runScriptInSandbox } from '../../../../../utils/helpers';

sentryTest('should catch thrown strings', async ({ getLocalTestPath, page, browserName }) => {
  if (browserName === 'webkit') {
    // This test fails on Webkit as errors thrown from `runScriptInSandbox` are Script Errors and skipped by Sentry
    sentryTest.skip();
  }

  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  const errorEventPromise = getFirstSentryEnvelopeRequest<Event>(page);

  await runScriptInSandbox(page, {
    content: `
      throw 'stringError';
    `,
  });

  const eventData = await errorEventPromise;

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'stringError',
    mechanism: {
      type: 'onerror',
      handled: false,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });

  expect(eventData.exception?.values?.[0].stacktrace?.frames).toHaveLength(1);
});
