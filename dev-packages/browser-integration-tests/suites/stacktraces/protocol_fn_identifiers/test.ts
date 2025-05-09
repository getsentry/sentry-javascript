import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest(
  'should parse function identifiers that are protocol names correctly @firefox',
  async ({ getLocalTestUrl, page, runInChromium, runInFirefox, runInWebkit }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const frames = eventData.exception?.values?.[0].stacktrace?.frames;

    expect(eventData).toBeDefined();
    expect(eventData.exception?.values).toBeDefined();
    expect(frames).toBeDefined();

    runInChromium(() => {
      expect(frames).toMatchObject([
        { function: '?' },
        { function: '?' },
        { function: 'blob' },
        { function: 'file' },
        { function: 'https' },
        { function: 'webpack' },
        { function: 'File.http' },
      ]);
    });

    runInFirefox(() => {
      expect(frames).toMatchObject([
        { function: '?' },
        { function: '?' },
        { function: 'blob' },
        { function: 'file' },
        { function: 'https' },
        { function: 'webpack' },
        { function: 'http' },
      ]);
    });

    runInWebkit(() => {
      expect(frames).toMatchObject([
        { function: 'global code' },
        { function: '?' },
        { function: 'blob' },
        { function: 'file' },
        { function: 'https' },
        { function: 'webpack' },
        { function: 'http' },
      ]);
    });
  },
);

sentryTest(
  'should not add any part of the function identifier to beginning of filename',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(eventData).toBeDefined();
    expect(eventData.exception?.values).toBeDefined();
    expect(eventData.exception?.values?.[0].stacktrace).toBeDefined();
    expect(eventData.exception?.values?.[0].stacktrace?.frames).toMatchObject(
      Array(7).fill({ filename: expect.stringMatching(/^http:\/?/) }),
    );
  },
);
