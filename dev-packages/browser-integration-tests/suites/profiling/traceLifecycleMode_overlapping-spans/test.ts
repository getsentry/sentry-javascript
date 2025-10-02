import { expect } from '@playwright/test';
import type { Event, Profile, ProfileChunkEnvelope } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  getMultipleSentryEnvelopeRequests,
  properEnvelopeRequestParser,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../utils/helpers';

sentryTest(
  'does not send profile envelope when document-policy is not set',
  async ({ page, getLocalTestUrl, browserName }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      // Profiling only works when tracing is enabled
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const req = await waitForTransactionRequestOnUrl(page, url);
    const transactionEvent = properEnvelopeRequestParser<Event>(req, 0);
    const profileEvent = properEnvelopeRequestParser<Profile>(req, 1);

    expect(transactionEvent).toBeDefined();

    expect(profileEvent).toBeUndefined();
  },
);

sentryTest(
  'sends profile envelope in trace mode (single chunk for overlapping spans)',
  async ({ page, getLocalTestUrl, browserName }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      // Profiling only works when tracing is enabled
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });
    await page.goto(url);

    const profileChunkEnvelopePromise = getMultipleSentryEnvelopeRequests<ProfileChunkEnvelope>(
      page,
      1,
      { envelopeType: 'profile_chunk' },
      properFullEnvelopeRequestParser,
    );

    const profileChunkEnvelopeItem = (await profileChunkEnvelopePromise)[0][1][0];
    const envelopeItemHeader = profileChunkEnvelopeItem[0];
    const envelopeItemPayload = profileChunkEnvelopeItem[1];

    expect(envelopeItemHeader).toHaveProperty('type', 'profile_chunk');

    expect(envelopeItemPayload.profile).toBeDefined();
    expect(envelopeItemPayload.version).toBe('2');
    expect(envelopeItemPayload.platform).toBe('javascript');

    // Required profile metadata (Sample Format V2)
    // https://develop.sentry.dev/sdk/telemetry/profiles/sample-format-v2/
    expect(typeof envelopeItemPayload.profiler_id).toBe('string');
    expect(envelopeItemPayload.profiler_id).toMatch(/^[a-f0-9]{32}$/);
    expect(typeof envelopeItemPayload.chunk_id).toBe('string');
    expect(envelopeItemPayload.chunk_id).toMatch(/^[a-f0-9]{32}$/);
    expect(envelopeItemPayload.client_sdk).toBeDefined();
    expect(typeof envelopeItemPayload.client_sdk.name).toBe('string');
    expect(typeof envelopeItemPayload.client_sdk.version).toBe('string');
    expect(typeof envelopeItemPayload.release).toBe('string');
    expect(envelopeItemPayload.debug_meta).toBeDefined();
    expect(Array.isArray(envelopeItemPayload?.debug_meta?.images)).toBe(true);

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
      expect(typeof sample.timestamp).toBe('number');
      const ts = sample.timestamp;
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
    const startTimeSec = (profile.samples[0] as any).timestamp as number;
    const endTimeSec = (profile.samples[profile.samples.length - 1] as any).timestamp as number;
    const durationSec = endTimeSec - startTimeSec;

    // Should be at least 20ms based on our setTimeout(21) in the test
    expect(durationSec).toBeGreaterThan(0.2);
  },
);

sentryTest('attaches thread data to child spans (trace mode)', async ({ page, getLocalTestUrl, browserName }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });
  const req = await waitForTransactionRequestOnUrl(page, url);
  const rootSpan = properEnvelopeRequestParser<Event>(req, 0) as any;

  expect(rootSpan?.type).toBe('transaction');
  expect(rootSpan.transaction).toBe('root-fibonacci-2');

  const profilerId = rootSpan?.contexts?.profile?.profiler_id as string | undefined;
  expect(typeof profilerId).toBe('string');

  expect(profilerId).toMatch(/^[a-f0-9]{32}$/);

  const spans = (rootSpan?.spans ?? []) as Array<{ data?: Record<string, unknown> }>;
  expect(spans.length).toBeGreaterThan(0);
  for (const span of spans) {
    expect(span.data).toBeDefined();
    expect(span.data?.['thread.id']).toBe('0');
    expect(span.data?.['thread.name']).toBe('main');
  }
});
