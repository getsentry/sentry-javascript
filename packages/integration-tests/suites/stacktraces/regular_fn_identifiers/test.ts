import { expect } from '@playwright/test';
import { Event } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest(
  'should parse function identifiers correctly',
  async ({ getLocalTestPath, page, runInChromium, runInFirefox, runInWebkit }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const frames = eventData.exception?.values?.[0].stacktrace?.frames;

    runInChromium(() => {
      expect(frames).toMatchObject([
        { function: '?' },
        { function: '?' },
        { function: 'qux' },
        { function: '?' },
        { function: '?' },
        { function: 'foo' },
        { function: 'bar' },
        { function: 'Function.baz' },
      ]);
    });

    runInFirefox(() => {
      expect(frames).toMatchObject([
        { function: '?' },
        { function: '?' },
        { function: 'qux' },
        { function: 'qux/<' },
        { function: 'qux/</<' },
        { function: 'foo' },
        { function: 'bar' },
        { function: 'baz' },
      ]);
    });

    runInWebkit(() => {
      expect(frames).toMatchObject([
        { function: 'global code' },
        { function: '?' },
        { function: 'qux' },
        { function: '?' },
        { function: '?' },
        { function: 'foo' },
        { function: 'bar' },
        { function: 'baz' },
      ]);
    });
  },
);

sentryTest('should not add any part of the function identifier inside filename', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values?.[0].stacktrace?.frames).toMatchObject(
    Array(8).fill({ filename: expect.stringMatching(/^file:\/?/) }),
  );
});
