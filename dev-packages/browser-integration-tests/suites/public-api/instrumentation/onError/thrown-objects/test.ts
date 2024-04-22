import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, runScriptInSandbox } from '../../../../../utils/helpers';

sentryTest('should catch thrown objects', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  const [, eventData] = await Promise.all([
    runScriptInSandbox(page, {
      content: `
      throw {
        error: 'stuff is broken',
        somekey: 'ok'
      };`,
    }),
    getFirstSentryEnvelopeRequest<Event>(page),
  ]);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'Object captured as exception with keys: error, somekey',
    mechanism: {
      type: 'onerror',
      handled: false,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});
