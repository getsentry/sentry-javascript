import { expect } from '@playwright/test';
import type { ProfileChunkEnvelope } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  countEnvelopes,
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../utils/helpers';

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

    expect(envelopeItemHeader).toHaveProperty('type', 'profile_chunk');

    expect(envelopeItemPayload1.profile).toBeDefined();
    expect(envelopeItemPayload1.version).toBe('2');
    expect(envelopeItemPayload1.platform).toBe('javascript');

    // Required profile metadata (Sample Format V2)
    expect(typeof envelopeItemPayload1.profiler_id).toBe('string');
    expect(envelopeItemPayload1.profiler_id).toMatch(/^[a-f0-9]{32}$/);
    expect(typeof envelopeItemPayload1.chunk_id).toBe('string');
    expect(envelopeItemPayload1.chunk_id).toMatch(/^[a-f0-9]{32}$/);
    expect(envelopeItemPayload1.client_sdk).toBeDefined();
    expect(typeof envelopeItemPayload1.client_sdk.name).toBe('string');
    expect(typeof envelopeItemPayload1.client_sdk.version).toBe('string');
    expect(typeof envelopeItemPayload1.release).toBe('string');
    expect(envelopeItemPayload1.debug_meta).toBeDefined();
    expect(Array.isArray(envelopeItemPayload1?.debug_meta?.images)).toBe(true);

    const profile1 = envelopeItemPayload1.profile;

    expect(profile1.samples).toBeDefined();
    expect(profile1.stacks).toBeDefined();
    expect(profile1.frames).toBeDefined();
    expect(profile1.thread_metadata).toBeDefined();

    // Samples
    expect(profile1.samples.length).toBeGreaterThanOrEqual(2);
    let previousTimestamp = Number.NEGATIVE_INFINITY;
    for (const sample of profile1.samples) {
      expect(typeof sample.stack_id).toBe('number');
      expect(sample.stack_id).toBeGreaterThanOrEqual(0);
      expect(sample.stack_id).toBeLessThan(profile1.stacks.length);

      // In trace lifecycle mode, samples carry a numeric timestamp (ms since epoch or similar clock)
      expect(typeof (sample as any).timestamp).toBe('number');
      const ts = (sample as any).timestamp as number;
      expect(Number.isFinite(ts)).toBe(true);
      expect(ts).toBeGreaterThan(0);
      // Monotonic non-decreasing timestamps
      expect(ts).toBeGreaterThanOrEqual(previousTimestamp);
      previousTimestamp = ts;

      expect(sample.thread_id).toBe('0'); // Should be main thread
    }

    // Stacks
    expect(profile1.stacks.length).toBeGreaterThan(0);
    for (const stack of profile1.stacks) {
      expect(Array.isArray(stack)).toBe(true);
      for (const frameIndex of stack) {
        expect(typeof frameIndex).toBe('number');
        expect(frameIndex).toBeGreaterThanOrEqual(0);
        expect(frameIndex).toBeLessThan(profile1.frames.length);
      }
    }

    // Frames
    expect(profile1.frames.length).toBeGreaterThan(0);
    for (const frame of profile1.frames) {
      expect(frame).toHaveProperty('function');
      expect(typeof frame.function).toBe('string');

      if (frame.function !== 'fetch' && frame.function !== 'setTimeout') {
        expect(frame).toHaveProperty('abs_path');
        expect(frame).toHaveProperty('lineno');
        expect(frame).toHaveProperty('colno');
        expect(typeof frame.abs_path).toBe('string');
        expect(typeof frame.lineno).toBe('number');
        expect(typeof frame.colno).toBe('number');
      }
    }

    const functionNames = profile1.frames.map(frame => frame.function).filter(name => name !== '');

    if ((process.env.PW_BUNDLE || '').endsWith('min')) {
      // In bundled mode, function names are minified
      expect(functionNames.length).toBeGreaterThan(0);
      expect((functionNames as string[]).every(name => name?.length > 0)).toBe(true); // Just make sure they're not empty strings
    } else {
      expect(functionNames).toEqual(
        expect.arrayContaining([
          '_startRootSpan',
          'withScope',
          'createChildOrRootSpan',
          'startSpanManual',
          'startJSSelfProfile',

          // first function is captured (other one is in other chunk)
          'fibonacci',
        ]),
      );
    }

    expect(profile1.thread_metadata).toHaveProperty('0');
    expect(profile1.thread_metadata['0']).toHaveProperty('name');
    expect(profile1.thread_metadata['0'].name).toBe('main');

    // Test that profile duration makes sense (should be > 20ms based on test setup)
    const startTimeSec = (profile1.samples[0] as any).timestamp as number;
    const endTimeSec = (profile1.samples[profile1.samples.length - 1] as any).timestamp as number;
    const durationSec = endTimeSec - startTimeSec;

    // Should be at least 20ms based on our setTimeout(21) in the test
    expect(durationSec).toBeGreaterThan(0.2);

    // === PROFILE CHUNK 2 ===

    const profileChunkEnvelopeItem2 = profileChunkEnvelopes[1][1][0];
    const envelopeItemHeader2 = profileChunkEnvelopeItem2[0];
    const envelopeItemPayload2 = profileChunkEnvelopeItem2[1];

    // Basic sanity on the second chunk: has correct envelope type and structure
    expect(envelopeItemHeader2).toHaveProperty('type', 'profile_chunk');
    expect(envelopeItemPayload2.profile).toBeDefined();
    expect(envelopeItemPayload2.version).toBe('2');
    expect(envelopeItemPayload2.platform).toBe('javascript');

    // Required profile metadata (Sample Format V2)
    // https://develop.sentry.dev/sdk/telemetry/profiles/sample-format-v2/
    expect(typeof envelopeItemPayload2.profiler_id).toBe('string');
    expect(envelopeItemPayload2.profiler_id).toMatch(/^[a-f0-9]{32}$/);
    expect(typeof envelopeItemPayload2.chunk_id).toBe('string');
    expect(envelopeItemPayload2.chunk_id).toMatch(/^[a-f0-9]{32}$/);
    expect(envelopeItemPayload2.client_sdk).toBeDefined();
    expect(typeof envelopeItemPayload2.client_sdk.name).toBe('string');
    expect(typeof envelopeItemPayload2.client_sdk.version).toBe('string');
    expect(typeof envelopeItemPayload2.release).toBe('string');
    expect(envelopeItemPayload2.debug_meta).toBeDefined();
    expect(Array.isArray(envelopeItemPayload2?.debug_meta?.images)).toBe(true);

    const profile2 = envelopeItemPayload2.profile;

    const functionNames2 = profile2.frames.map(frame => frame.function).filter(name => name !== '');

    if ((process.env.PW_BUNDLE || '').endsWith('min')) {
      // In bundled mode, function names are minified
      expect(functionNames2.length).toBeGreaterThan(0);
      expect((functionNames2 as string[]).every(name => name?.length > 0)).toBe(true); // Just make sure they're not empty strings
    } else {
      expect(functionNames2).toEqual(
        expect.arrayContaining([
          '_startRootSpan',
          'withScope',
          'createChildOrRootSpan',
          'startSpanManual',
          'startJSSelfProfile',

          // second function is captured (other one is in other chunk)
          'largeSum',
        ]),
      );
    }
  },
);
