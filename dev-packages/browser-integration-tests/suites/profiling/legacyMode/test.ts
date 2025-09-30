import { expect } from '@playwright/test';
import type { Event, Profile } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  properEnvelopeRequestParser,
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

sentryTest('sends profile envelope in legacy mode', async ({ page, getLocalTestUrl, browserName }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    // Profiling only works when tracing is enabled
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });

  const req = await waitForTransactionRequestOnUrl(page, url);
  const profileEvent = properEnvelopeRequestParser<Profile>(req, 1);
  expect(profileEvent).toBeDefined();

  const profile = profileEvent.profile;
  expect(profileEvent.profile).toBeDefined();

  expect(profile.samples).toBeDefined();
  expect(profile.stacks).toBeDefined();
  expect(profile.frames).toBeDefined();
  expect(profile.thread_metadata).toBeDefined();

  // Samples
  expect(profile.samples.length).toBeGreaterThanOrEqual(2);
  for (const sample of profile.samples) {
    expect(typeof sample.elapsed_since_start_ns).toBe('string');
    expect(sample.elapsed_since_start_ns).toMatch(/^\d+$/); // Numeric string
    expect(parseInt(sample.elapsed_since_start_ns, 10)).toBeGreaterThanOrEqual(0);

    expect(typeof sample.stack_id).toBe('number');
    expect(sample.stack_id).toBeGreaterThanOrEqual(0);
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
    // Function names are minified in minified bundles
    expect(functionNames.length).toBeGreaterThan(0);
    expect((functionNames as string[]).every(name => name?.length > 0)).toBe(true); // Just make sure they're not empty strings
  } else {
    expect(functionNames).toEqual(
      expect.arrayContaining([
        '_startRootSpan',
        'withScope',
        'createChildOrRootSpan',
        'startSpanManual',
        'startProfileForSpan',
        'startJSSelfProfile',
      ]),
    );
  }

  expect(profile.thread_metadata).toHaveProperty('0');
  expect(profile.thread_metadata['0']).toHaveProperty('name');
  expect(profile.thread_metadata['0'].name).toBe('main');

  // Test that profile duration makes sense (should be > 20ms based on test setup)
  const startTime = parseInt(profile.samples[0].elapsed_since_start_ns, 10);
  const endTime = parseInt(profile.samples[profile.samples.length - 1].elapsed_since_start_ns, 10);
  const durationNs = endTime - startTime;
  const durationMs = durationNs / 1_000_000; // Convert ns to ms

  // Should be at least 20ms based on our setTimeout(21) in the test
  expect(durationMs).toBeGreaterThan(20);
});
