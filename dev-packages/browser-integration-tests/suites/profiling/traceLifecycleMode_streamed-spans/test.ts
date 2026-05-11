import { expect } from '@playwright/test';
import type { ProfileChunkEnvelope } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../utils/helpers';
import { waitForStreamedSpans } from '../../../utils/spanUtils';
import { validateProfile, validateProfilePayloadMetadata } from '../test-utils';

sentryTest(
  'attaches thread.id and thread.name to streamed spans (trace mode)',
  async ({ page, getLocalTestUrl, browserName }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const spansPromise = waitForStreamedSpans(page, receivedSpans => {
      return receivedSpans.some(s => s.name === 'root-fibonacci');
    });

    const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });
    await page.goto(url);

    const spans = await spansPromise;

    const rootSpan = spans.find(s => s.name === 'root-fibonacci');
    expect(rootSpan).toBeDefined();

    expect(rootSpan!.attributes?.['thread.id']).toEqual({ type: 'string', value: '0' });
    expect(rootSpan!.attributes?.['thread.name']).toEqual({ type: 'string', value: 'main' });

    const childSpans = spans.filter(s => s.name === 'child-span-1' || s.name === 'child-span-2');
    expect(childSpans.length).toBeGreaterThanOrEqual(1);

    for (const child of childSpans) {
      expect(child.attributes?.['thread.id']).toEqual({ type: 'string', value: '0' });
      expect(child.attributes?.['thread.name']).toEqual({ type: 'string', value: 'main' });
    }
  },
);

sentryTest(
  'sends profile_chunk envelope alongside streamed spans',
  async ({ page, getLocalTestUrl, browserName }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });

    const profileChunkEnvelopes = await getMultipleSentryEnvelopeRequests<ProfileChunkEnvelope>(
      page,
      1,
      { url, envelopeType: 'profile_chunk', timeout: 15_000 },
      properFullEnvelopeRequestParser,
    );

    const profileChunkEnvelopeItem = profileChunkEnvelopes[0][1][0];
    const envelopeItemHeader = profileChunkEnvelopeItem[0];
    const envelopeItemPayload = profileChunkEnvelopeItem[1];

    expect(envelopeItemHeader).toEqual({ type: 'profile_chunk', platform: 'javascript' });
    expect(envelopeItemPayload.profile).toBeDefined();

    validateProfilePayloadMetadata(envelopeItemPayload);
    validateProfile(envelopeItemPayload.profile, { isChunkFormat: true });
  },
);
