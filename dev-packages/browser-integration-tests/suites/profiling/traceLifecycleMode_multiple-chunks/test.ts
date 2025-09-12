import { expect } from '@playwright/test';
import type { ProfileChunkEnvelope } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  countEnvelopes,
  getMultipleSentryEnvelopeRequests,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
} from '../../../utils/helpers';

sentryTest('does not send profile envelope when document-policy is not set', async ({ page, getLocalTestUrl }) => {
  if (shouldSkipTracingTest()) {
    // Profiling only works when tracing is enabled
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  // Assert that no profile_chunk envelope is sent without policy header
  const chunkCount = await countEnvelopes(page, { url, envelopeType: 'profile_chunk', timeout: 1500 });
  expect(chunkCount).toBe(0);
});

sentryTest('sends profile_chunk envelopes in trace mode (multiple chunks)', async ({ page, getLocalTestUrl, browserName }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    // Profiling only works when tracing is enabled
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });
  await page.goto(url);

  // Expect at least 2 chunks because subject creates two separate root spans,
  // causing the profiler to stop and emit a chunk after each root span ends.
  const profileChunkEnvelopes = await getMultipleSentryEnvelopeRequests<ProfileChunkEnvelope>(
    page,
    2,
    { envelopeType: 'profile_chunk', timeout: 5000 },
    properFullEnvelopeRequestParser,
  );

  expect(profileChunkEnvelopes.length).toBeGreaterThanOrEqual(2);

  // Validate the first chunk thoroughly
  const profileChunkEnvelopeItem = profileChunkEnvelopes[0][1][0];
  const envelopeItemHeader = profileChunkEnvelopeItem[0];
  const envelopeItemPayload = profileChunkEnvelopeItem[1];

  expect(envelopeItemHeader).toHaveProperty('type', 'profile_chunk');

  expect(envelopeItemPayload.profile).toBeDefined();
  expect(envelopeItemPayload.version).toBe('2');
  expect(envelopeItemPayload.platform).toBe('javascript');

  const profile = envelopeItemPayload.profile;

  expect(profile.samples).toBeDefined();
  expect(profile.stacks).toBeDefined();
  expect(profile.frames).toBeDefined();
  expect(profile.thread_metadata).toBeDefined();

  // Samples
  expect(profile.samples.length).toBeGreaterThanOrEqual(2);
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (const sample of profile.samples) {
    expect(typeof sample.stack_id).toBe('number');
    expect(sample.stack_id).toBeGreaterThanOrEqual(0);
    expect(sample.stack_id).toBeLessThan(profile.stacks.length);

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
  expect(profile.stacks.length).toBeGreaterThan(0);
  for (const stack of profile.stacks) {
    expect(Array.isArray(stack)).toBe(true);
    for (const frameIndex of stack) {
      expect(typeof frameIndex).toBe('number');
      expect(frameIndex).toBeGreaterThanOrEqual(0);
      expect(frameIndex).toBeLessThan(profile.frames.length);
    }
  }

  // Frames
  expect(profile.frames.length).toBeGreaterThan(0);
  for (const frame of profile.frames) {
    expect(frame).toHaveProperty('function');
    expect(frame).toHaveProperty('abs_path');
    expect(frame).toHaveProperty('lineno');
    expect(frame).toHaveProperty('colno');

    expect(typeof frame.function).toBe('string');
    expect(typeof frame.abs_path).toBe('string');
    expect(typeof frame.lineno).toBe('number');
    expect(typeof frame.colno).toBe('number');
  }

  const functionNames = profile.frames.map(frame => frame.function).filter(name => name !== '');

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

        // both functions are captured
        'fibonacci',
        'largeSum',
      ]),
    );
  }

  expect(profile.thread_metadata).toHaveProperty('0');
  expect(profile.thread_metadata['0']).toHaveProperty('name');
  expect(profile.thread_metadata['0'].name).toBe('main');

  // Test that profile duration makes sense (should be > 20ms based on test setup)
  const startTimeMs = (profile.samples[0] as any).timestamp as number;
  const endTimeMs = (profile.samples[profile.samples.length - 1] as any).timestamp as number;
  const durationMs = endTimeMs - startTimeMs;

  // Should be at least 20ms based on our setTimeout(21) in the test
  expect(durationMs).toBeGreaterThan(20);

  // Basic sanity on the second chunk: has correct envelope type and structure
  const secondChunkItem = profileChunkEnvelopes[1][1][0];
  const secondHeader = secondChunkItem[0];
  const secondPayload = secondChunkItem[1];
  expect(secondHeader).toHaveProperty('type', 'profile_chunk');
  expect(secondPayload.profile).toBeDefined();
  expect(secondPayload.version).toBe('2');
  expect(secondPayload.platform).toBe('javascript');
});
