import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest(
  'should add source context lines around stack frames from errors in Html',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventPromise = getFirstSentryEnvelopeRequest<Event>(page, url);

    await page.click('#inline-error-btn');

    const eventData = await eventPromise;

    expect(eventData.exception?.values).toHaveLength(1);

    const exception = eventData.exception?.values?.[0];

    expect(exception).toMatchObject({
      stacktrace: {
        frames: [
          {
            colno: 97,
            lineno: 7,
            pre_context: ['    <meta charset="utf-8">', '  </head>', '  <body>'],
            context_line:
              '      <button id="inline-error-btn" onclick="throw new Error(\'Error with context lines\')">Click me</button>',
            post_context: [
              '      <button id="script-error-btn">Click me too</button>',
              '  <script defer="" src="init.bundle.js"></script><script defer="" src="subject.bundle.js"></script>',
              '  <footer>',
            ],
          },
        ],
      },
    });
  },
);

sentryTest('should not add source context lines to errors from scripts', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventPromise = getFirstSentryEnvelopeRequest<Event>(page, url);

  await page.click('#script-error-btn');

  const eventData = await eventPromise;
  const exception = eventData.exception?.values?.[0];
  const frames = exception?.stacktrace?.frames;
  expect(frames).toHaveLength(1);
  frames?.forEach(f => {
    expect(f).not.toHaveProperty('pre_context');
    expect(f).not.toHaveProperty('context_line');
    expect(f).not.toHaveProperty('post_context');
  });
});
