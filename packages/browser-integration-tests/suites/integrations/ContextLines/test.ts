import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest(
  'should add source context lines around stack frames from errors in Html inline JS',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventPromise = getFirstSentryEnvelopeRequest<Event>(page, url);

    const clickPromise = page.click('#inline-error-btn');

    const [eventData] = await Promise.all([eventPromise, clickPromise]);

    expect(eventData.exception?.values).toHaveLength(1);

    const exception = eventData.exception?.values?.[0];

    expect(exception).toMatchObject({
      stacktrace: {
        frames: [
          {
            pre_context: ['    <meta charset="utf-8">', '  </head>', '  <body>'],
            context_line:
              '      <button id="inline-error-btn" onclick="throw new Error(\'Error with context lines\')">Click me</button>',
            post_context: [
              '      <button id="script-error-btn">Click me too</button>',
              expect.stringContaining('subject.bundle.js'), // this line varies in the test based on tarball/cdn bundle (+variants)
              '  <footer>',
            ],
          },
        ],
      },
    });
  },
);

sentryTest('should not add source context lines to errors from script files', async ({ getLocalTestPath, page }) => {
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
