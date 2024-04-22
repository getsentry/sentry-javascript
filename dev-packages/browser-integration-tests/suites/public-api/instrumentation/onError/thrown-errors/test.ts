import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, runScriptInSandbox } from '../../../../../utils/helpers';

sentryTest('should catch thrown errors', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  runScriptInSandbox(page, {
    content: `
      throw new Error('realError');
    `,
  });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'Error',
    value: 'realError',
    mechanism: {
      type: 'onerror',
      handled: false,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});
