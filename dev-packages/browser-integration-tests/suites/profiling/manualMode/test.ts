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

sentryTest('sends profile_chunk envelopes in manual mode', async ({ page, getLocalTestUrl, browserName }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    // Profiling only works when tracing is enabled
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });

  // In manual mode we start and stop once -> expect exactly one chunk
  const profileChunkEnvelopes = await getMultipleSentryEnvelopeRequests<ProfileChunkEnvelope>(
    page,
    2,
    { url, envelopeType: 'profile_chunk', timeout: 8000 },
    properFullEnvelopeRequestParser,
  );

  expect(profileChunkEnvelopes.length).toBe(2);

  // Validate the first chunk thoroughly
  const profileChunkEnvelopeItem = profileChunkEnvelopes[0][1][0];
  const envelopeItemHeader = profileChunkEnvelopeItem[0];
  const envelopeItemPayload1 = profileChunkEnvelopeItem[1];

  expect(envelopeItemHeader).toEqual({ type: 'profile_chunk', platform: 'javascript' });
  expect(envelopeItemPayload1.profile).toBeDefined();

  const profilerId1 = envelopeItemPayload1.profiler_id;

  validateProfilePayloadMetadata(envelopeItemPayload1);

  validateProfile(envelopeItemPayload1.profile, {
    expectedFunctionNames: ['startJSSelfProfile', 'fibonacci', 'largeSum'],
    minSampleDurationMs: 20,
    isChunkFormat: true,
  });

  // only contains fibonacci
  const functionNames1 = envelopeItemPayload1.profile.frames.map(frame => frame.function).filter(name => name !== '');
  expect(functionNames1).toEqual(expect.not.arrayContaining(['fibonacci1', 'fibonacci2', 'fibonacci3']));

  // === PROFILE CHUNK 2 ===

  const profileChunkEnvelopeItem2 = profileChunkEnvelopes[1][1][0];
  const envelopeItemHeader2 = profileChunkEnvelopeItem2[0];
  const envelopeItemPayload2 = profileChunkEnvelopeItem2[1];

  expect(envelopeItemHeader2).toEqual({ type: 'profile_chunk', platform: 'javascript' });
  expect(envelopeItemPayload2.profile).toBeDefined();

  expect(envelopeItemPayload2.profiler_id).toBe(profilerId1); // same profiler id for the whole session

  validateProfilePayloadMetadata(envelopeItemPayload2);

  validateProfile(envelopeItemPayload2.profile, {
    expectedFunctionNames: [
      'startJSSelfProfile',
      'fibonacci1', // called by fibonacci2
      'fibonacci2',
    ],
    isChunkFormat: true,
  });

  // does not contain notProfiledFib (called during unprofiled part)
  const functionNames2 = envelopeItemPayload2.profile.frames.map(frame => frame.function).filter(name => name !== '');
  expect(functionNames2).toEqual(expect.not.arrayContaining(['notProfiledFib']));
});
