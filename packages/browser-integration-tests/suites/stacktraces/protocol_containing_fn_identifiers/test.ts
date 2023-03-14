import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest(
  'should parse function identifiers that contain protocol names correctly',
  async ({ getLocalTestPath, page, runInChromium, runInFirefox, runInWebkit }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const frames = eventData.exception?.values?.[0].stacktrace?.frames;

    runInChromium(() => {
      expect(frames).toMatchObject([
        { function: '?' },
        { function: '?' },
        { function: 'decodeBlob' },
        { function: 'readFile' },
        { function: 'httpsCall' },
        { function: 'webpackDevServer' },
        { function: 'Response.httpCode' },
      ]);
    });

    runInFirefox(() => {
      expect(frames).toMatchObject([
        { function: '?' },
        { function: '?' },
        { function: 'decodeBlob' },
        { function: 'readFile' },
        { function: 'httpsCall' },
        { function: 'webpackDevServer' },
        { function: 'httpCode' },
      ]);
    });

    runInWebkit(() => {
      expect(frames).toMatchObject([
        { function: 'global code' },
        { function: '?' },
        { function: 'decodeBlob' },
        { function: 'readFile' },
        { function: 'httpsCall' },
        { function: 'webpackDevServer' },
        { function: 'httpCode' },
      ]);
    });
  },
);

sentryTest(
  'should not add any part of the function identifier to beginning of filename',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(eventData.exception?.values?.[0].stacktrace?.frames).toMatchObject(
      // specifically, we're trying to avoid values like `Blob@file://path/to/file` in frames with function names like `makeBlob`
      Array(7).fill({ filename: expect.stringMatching(/^file:\/?/) }),
    );
  },
);
