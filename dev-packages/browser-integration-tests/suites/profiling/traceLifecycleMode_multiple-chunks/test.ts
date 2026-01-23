import { expect } from '@playwright/test';
import type { ProfileChunkEnvelope } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  countEnvelopes,
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../utils/helpers';
import { validateProfile, validateProfilePayloadMetadata } from '../test-utils';

sentryTest(
  'does not send profile envelope when document-policy is not set',
  async ({ page, getLocalTestUrl, browserName }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      // Profiling only works when tracing is enabled
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    // Assert that no profile_chunk envelope is sent without policy header
    const chunkCount = await countEnvelopes(page, { url, envelopeType: 'profile_chunk', timeout: 1500 });
    expect(chunkCount).toBe(0);
  },
);

sentryTest(
  'sends profile_chunk envelopes in trace mode (multiple chunks)',
  async ({ page, getLocalTestUrl, browserName }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      // Profiling only works when tracing is enabled
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });

    // Expect at least 2 chunks because subject creates two separate root spans,
    // causing the profiler to stop and emit a chunk after each root span ends.
    const profileChunkEnvelopes = await getMultipleSentryEnvelopeRequests<ProfileChunkEnvelope>(
      page,
      2,
      { url, envelopeType: 'profile_chunk', timeout: 5000 },
      properFullEnvelopeRequestParser,
    );

    expect(profileChunkEnvelopes.length).toBeGreaterThanOrEqual(2);

    // Validate the first chunk thoroughly
    const profileChunkEnvelopeItem = profileChunkEnvelopes[0][1][0];
    const envelopeItemHeader = profileChunkEnvelopeItem[0];
    const envelopeItemPayload1 = profileChunkEnvelopeItem[1];

    expect(envelopeItemHeader).toEqual({ type: 'profile_chunk', platform: 'javascript' });
    expect(envelopeItemPayload1.profile).toBeDefined();

    validateProfilePayloadMetadata(envelopeItemPayload1);

    validateProfile(envelopeItemPayload1.profile, {
      expectedFunctionNames: [
        '_startRootSpan',
        'withScope',
        'createChildOrRootSpan',
        'startSpanManual',
        'startJSSelfProfile',
        // first function is captured (other one is in other chunk)
        'fibonacci',
      ],
      // Should be at least 20ms based on our setTimeout(21) in the test
      minSampleDurationMs: 20,
      isChunkFormat: true,
    });

    // === PROFILE CHUNK 2 ===

    const profileChunkEnvelopeItem2 = profileChunkEnvelopes[1][1][0];
    const envelopeItemHeader2 = profileChunkEnvelopeItem2[0];
    const envelopeItemPayload2 = profileChunkEnvelopeItem2[1];

    expect(envelopeItemHeader2).toEqual({ type: 'profile_chunk', platform: 'javascript' });
    expect(envelopeItemPayload2.profile).toBeDefined();

    validateProfilePayloadMetadata(envelopeItemPayload2);

    validateProfile(envelopeItemPayload2.profile, {
      expectedFunctionNames: [
        '_startRootSpan',
        'withScope',
        'createChildOrRootSpan',
        'startSpanManual',
        'startJSSelfProfile',
        // second function is captured (other one is in other chunk)
        'largeSum',
      ],
      isChunkFormat: true,
    });
  },
);
