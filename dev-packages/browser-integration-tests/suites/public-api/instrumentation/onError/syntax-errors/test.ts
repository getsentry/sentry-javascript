import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, runScriptInSandbox } from '../../../../../utils/helpers';

sentryTest('should catch syntax errors', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);

  const [, eventData] = await Promise.all([
    runScriptInSandbox(page, {
      content: `
      foo{}; // SyntaxError
    `,
    }),
    getFirstSentryEnvelopeRequest<Event>(page),
  ]);

  expect(eventData.exception?.values).toHaveLength(1);
  expect(eventData.exception?.values?.[0]).toMatchObject({
    type: 'SyntaxError',
    value: "Unexpected token '{'",
    mechanism: {
      type: 'onerror',
      handled: false,
    },
    stacktrace: {
      frames: expect.any(Array),
    },
  });
});
