import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest(
  'should parse function identifiers correctly @firefox',
  async ({ getLocalTestUrl, page, runInChromium, runInFirefox, runInWebkit }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

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
        { function: 'Test.baz' },
      ]);
    });

    runInFirefox(() => {
      expect(frames).toMatchObject([
        { function: '?' },
        { function: '?' },
        { function: 'qux' },
        { function: 'qux/<' },
        // The function name below was 'qux/</<' on the Firefox versions < 124
        { function: 'qux/<' },
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

sentryTest(
  'should not add any part of the function identifier to beginning of filename',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(eventData.exception?.values?.[0].stacktrace?.frames).toMatchObject(
      // specifically, we're trying to avoid values like `Blob@file://path/to/file` in frames with function names like `makeBlob`
      Array(8).fill({ filename: expect.stringMatching(/^http:\/?/) }),
    );
  },
);
