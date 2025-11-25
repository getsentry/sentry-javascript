import { expect } from '@playwright/test';
import type { ContinuousThreadCpuProfile, ProfileChunk, ThreadCpuProfile } from '@sentry/core';

interface ValidateProfileOptions {
  expectedFunctionNames?: string[];
  minSampleDurationMs?: number;
  isChunkFormat?: boolean;
}

/**
 * Validates the metadata of a profile chunk envelope.
 * https://develop.sentry.dev/sdk/telemetry/profiles/sample-format-v2/
 */
export function validateProfilePayloadMetadata(profileChunk: ProfileChunk): void {
  expect(profileChunk.version).toBe('2');
  expect(profileChunk.platform).toBe('javascript');

  expect(typeof profileChunk.profiler_id).toBe('string');
  expect(profileChunk.profiler_id).toMatch(/^[a-f\d]{32}$/);

  expect(typeof profileChunk.chunk_id).toBe('string');
  expect(profileChunk.chunk_id).toMatch(/^[a-f\d]{32}$/);

  expect(profileChunk.client_sdk).toBeDefined();
  expect(typeof profileChunk.client_sdk.name).toBe('string');
  expect(typeof profileChunk.client_sdk.version).toBe('string');

  expect(typeof profileChunk.release).toBe('string');

  expect(profileChunk.debug_meta).toBeDefined();
  expect(Array.isArray(profileChunk?.debug_meta?.images)).toBe(true);
}

/**
 * Validates the basic structure and content of a Sentry profile.
 */
export function validateProfile(
  profile: ThreadCpuProfile | ContinuousThreadCpuProfile,
  options: ValidateProfileOptions = {},
): void {
  const { expectedFunctionNames, minSampleDurationMs, isChunkFormat = false } = options;

  // Basic profile structure
  expect(profile.samples).toBeDefined();
  expect(profile.stacks).toBeDefined();
  expect(profile.frames).toBeDefined();
  expect(profile.thread_metadata).toBeDefined();

  // SAMPLES
  expect(profile.samples.length).toBeGreaterThanOrEqual(2);
  let previousTimestamp: number = Number.NEGATIVE_INFINITY;

  for (const sample of profile.samples) {
    expect(typeof sample.stack_id).toBe('number');
    expect(sample.stack_id).toBeGreaterThanOrEqual(0);
    expect(sample.stack_id).toBeLessThan(profile.stacks.length);

    expect(sample.thread_id).toBe('0'); // Should be main thread

    // Timestamp validation - differs between chunk format (v2) and legacy format
    if (isChunkFormat) {
      const chunkProfileSample = sample as ContinuousThreadCpuProfile['samples'][number];

      // Chunk format uses numeric timestamps (UNIX timestamp in seconds with microseconds precision)
      expect(typeof chunkProfileSample.timestamp).toBe('number');
      const ts = chunkProfileSample.timestamp;
      expect(Number.isFinite(ts)).toBe(true);
      expect(ts).toBeGreaterThan(0);
      // Monotonic non-decreasing timestamps
      expect(ts).toBeGreaterThanOrEqual(previousTimestamp);
      previousTimestamp = ts;
    } else {
      // Legacy format uses elapsed_since_start_ns as a string
      const legacyProfileSample = sample as ThreadCpuProfile['samples'][number];

      expect(typeof legacyProfileSample.elapsed_since_start_ns).toBe('string');
      expect(legacyProfileSample.elapsed_since_start_ns).toMatch(/^\d+$/); // Numeric string
      expect(parseInt(legacyProfileSample.elapsed_since_start_ns, 10)).toBeGreaterThanOrEqual(0);
    }
  }

  // STACKS
  expect(profile.stacks.length).toBeGreaterThan(0);
  for (const stack of profile.stacks) {
    expect(Array.isArray(stack)).toBe(true);
    for (const frameIndex of stack) {
      expect(typeof frameIndex).toBe('number');
      expect(frameIndex).toBeGreaterThanOrEqual(0);
      expect(frameIndex).toBeLessThan(profile.frames.length);
    }
  }

  // FRAMES
  expect(profile.frames.length).toBeGreaterThan(0);
  for (const frame of profile.frames) {
    expect(frame).toHaveProperty('function');
    expect(typeof frame.function).toBe('string');

    // Some browser functions (fetch, setTimeout) may not have file locations
    if (frame.function !== 'fetch' && frame.function !== 'setTimeout') {
      expect(frame).toHaveProperty('abs_path');
      expect(frame).toHaveProperty('lineno');
      expect(frame).toHaveProperty('colno');
      expect(typeof frame.abs_path).toBe('string');
      expect(typeof frame.lineno).toBe('number');
      expect(typeof frame.colno).toBe('number');
    }
  }

  // Function names validation (only when not minified and expected names provided)
  if (expectedFunctionNames && expectedFunctionNames.length > 0) {
    const functionNames = profile.frames.map(frame => frame.function).filter(name => name !== '');

    if ((process.env.PW_BUNDLE || '').endsWith('min')) {
      // In minified bundles, just check that we have some non-empty function names
      expect(functionNames.length).toBeGreaterThan(0);
      expect((functionNames as string[]).every(name => name?.length > 0)).toBe(true);
    } else {
      // In non-minified bundles, check for expected function names
      expect(functionNames).toEqual(expect.arrayContaining(expectedFunctionNames));
    }
  }

  // THREAD METADATA
  expect(profile.thread_metadata).toHaveProperty('0');
  expect(profile.thread_metadata['0']).toHaveProperty('name');
  expect(profile.thread_metadata['0'].name).toBe('main');

  // DURATION
  if (minSampleDurationMs !== undefined) {
    let durationMs: number;

    if (isChunkFormat) {
      // Chunk format: timestamps are in seconds
      const chunkProfile = profile as ContinuousThreadCpuProfile;

      const startTimeSec = chunkProfile.samples[0].timestamp;
      const endTimeSec = chunkProfile.samples[chunkProfile.samples.length - 1].timestamp;
      durationMs = (endTimeSec - startTimeSec) * 1000; // Convert to ms
    } else {
      // Legacy format: elapsed_since_start_ns is in nanoseconds
      const legacyProfile = profile as ThreadCpuProfile;

      const startTimeNs = parseInt(legacyProfile.samples[0].elapsed_since_start_ns, 10);
      const endTimeNs = parseInt(legacyProfile.samples[legacyProfile.samples.length - 1].elapsed_since_start_ns, 10);
      durationMs = (endTimeNs - startTimeNs) / 1_000_000; // Convert ns to ms
    }

    expect(durationMs).toBeGreaterThan(minSampleDurationMs);
  }
}
