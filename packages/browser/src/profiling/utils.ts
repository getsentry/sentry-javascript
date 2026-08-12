/* eslint-disable max-lines */
import type { Client, ContinuousThreadCpuProfile, DebugImage, ProfileChunk, Span } from '@sentry/core/browser';
import {
  browserPerformanceTimeOrigin,
  debug,
  getClient,
  getDebugImagesForResources,
  GLOBAL_OBJ,
  uuid4,
} from '@sentry/core/browser';
import type { BrowserOptions } from '../client';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';
import type { JSSelfProfile, JSSelfProfiler, JSSelfProfilerConstructor } from './jsSelfProfiling';

// Checking if we are in Main or Worker thread: `self` (not `window`) is the `globalThis` in Web Workers and `importScripts` are only available in Web Workers
const isMainThread = 'window' in GLOBAL_OBJ && GLOBAL_OBJ.window === GLOBAL_OBJ && typeof importScripts === 'undefined';

// Setting ID to 0 as we cannot get an ID from Web Workers
export const PROFILER_THREAD_ID_STRING = String(0);
export const PROFILER_THREAD_NAME = isMainThread ? 'main' : 'worker';

/**
 * Create a profile chunk envelope item
 */
export function createProfileChunkPayload(
  jsSelfProfile: JSSelfProfile,
  client: Client,
  profilerId?: string,
): ProfileChunk {
  // only == to catch null and undefined
  if (jsSelfProfile == null) {
    throw new TypeError(
      `Cannot construct profiling event envelope without a valid profile. Got ${jsSelfProfile} instead.`,
    );
  }

  const continuousProfile = convertToContinuousProfile(jsSelfProfile);

  const options = client.getOptions();
  const sdk = client.getSdkMetadata?.()?.sdk;

  return {
    chunk_id: uuid4(),
    client_sdk: {
      name: sdk?.name ?? 'sentry.javascript.browser',
      version: sdk?.version ?? '0.0.0',
    },
    profiler_id: profilerId || uuid4(),
    platform: 'javascript',
    version: '2',
    release: options.release ?? '',
    environment: options.environment ?? 'production',
    debug_meta: {
      // function name obfuscation
      images: applyDebugMetadata(jsSelfProfile.resources),
    },
    profile: continuousProfile,
  };
}

/**
 * Validate a profile chunk against the Sample Format V2 requirements.
 * https://develop.sentry.dev/sdk/telemetry/profiles/sample-format-v2/
 * - Presence of samples, stacks, frames
 * - Required metadata fields
 */
export function validateProfileChunk(chunk: ProfileChunk): { valid: true } | { reason: string } {
  try {
    // Required metadata
    if (!chunk || typeof chunk !== 'object') {
      return { reason: 'chunk is not an object' };
    }

    // profiler_id and chunk_id must be 32 lowercase hex chars
    const isHex32 = (val: unknown): boolean => typeof val === 'string' && /^[a-f0-9]{32}$/.test(val);
    if (!isHex32(chunk.profiler_id)) {
      return { reason: 'missing or invalid profiler_id' };
    }
    if (!isHex32(chunk.chunk_id)) {
      return { reason: 'missing or invalid chunk_id' };
    }

    if (!chunk.client_sdk) {
      return { reason: 'missing client_sdk metadata' };
    }

    // Profile data must have frames, stacks, samples
    const profile = chunk.profile as { frames?: unknown[]; stacks?: unknown[]; samples?: unknown[] } | undefined;
    if (!profile) {
      return { reason: 'missing profile data' };
    }

    if (!Array.isArray(profile.frames) || !profile.frames.length) {
      return { reason: 'profile has no frames' };
    }
    if (!Array.isArray(profile.stacks) || !profile.stacks.length) {
      return { reason: 'profile has no stacks' };
    }
    if (!Array.isArray(profile.samples) || !profile.samples.length) {
      return { reason: 'profile has no samples' };
    }

    return { valid: true };
  } catch (e) {
    return { reason: `unknown validation error: ${e}` };
  }
}

/**
 * Convert from JSSelfProfile format to ContinuousThreadCpuProfile format.
 */
function convertToContinuousProfile(input: {
  frames: { name: string; resourceId?: number; line?: number; column?: number }[];
  stacks: { frameId: number; parentId?: number }[];
  samples: { timestamp: number; stackId?: number }[];
  resources: string[];
}): ContinuousThreadCpuProfile {
  // Frames map 1:1 by index; fill only when present to avoid sparse writes
  const frames: ContinuousThreadCpuProfile['frames'] = [];
  for (let i = 0; i < input.frames.length; i++) {
    const frame = input.frames[i];
    if (!frame) {
      continue;
    }
    frames[i] = {
      function: frame.name,
      abs_path: typeof frame.resourceId === 'number' ? input.resources[frame.resourceId] : undefined,
      lineno: frame.line,
      colno: frame.column,
    };
  }

  // Build stacks by following parent links, top->down order (root last)
  const stacks: ContinuousThreadCpuProfile['stacks'] = [];
  for (let i = 0; i < input.stacks.length; i++) {
    const stackHead = input.stacks[i];
    if (!stackHead) {
      continue;
    }
    const list: number[] = [];
    let current: { frameId: number; parentId?: number } | undefined = stackHead;
    while (current) {
      list.push(current.frameId);
      current = current.parentId === undefined ? undefined : input.stacks[current.parentId];
    }
    stacks[i] = list;
  }

  // Align timestamps to SDK time origin to match span/event timelines
  const perfOrigin = browserPerformanceTimeOrigin();
  const origin = typeof performance.timeOrigin === 'number' ? performance.timeOrigin : perfOrigin || 0;
  const adjustForOriginChange = origin - (perfOrigin || origin);

  const samples: ContinuousThreadCpuProfile['samples'] = [];
  for (let i = 0; i < input.samples.length; i++) {
    const sample = input.samples[i];
    if (!sample) {
      continue;
    }
    // Convert ms to seconds epoch-based timestamp
    const timestampSeconds = (origin + (sample.timestamp - adjustForOriginChange)) / 1000;
    samples[i] = {
      stack_id: sample.stackId ?? 0,
      thread_id: PROFILER_THREAD_ID_STRING,
      timestamp: timestampSeconds,
    };
  }

  return {
    frames,
    stacks,
    samples,
    thread_metadata: { [PROFILER_THREAD_ID_STRING]: { name: PROFILER_THREAD_NAME } },
  };
}

/**
 * Applies debug meta data to an event from a list of paths to resources (sourcemaps)
 */
export function applyDebugMetadata(resource_paths: ReadonlyArray<string>): DebugImage[] {
  const client = getClient();
  const options = client?.getOptions();
  const stackParser = options?.stackParser;

  if (!stackParser) {
    return [];
  }

  return getDebugImagesForResources(stackParser, resource_paths);
}

/**
 * Checks the given sample rate to make sure it is valid type and value (a boolean, or a number between 0 and 1).
 */
export function isValidSampleRate(rate: unknown): boolean {
  // we need to check NaN explicitly because it's of type 'number' and therefore wouldn't get caught by this typecheck
  if ((typeof rate !== 'number' && typeof rate !== 'boolean') || (typeof rate === 'number' && isNaN(rate))) {
    DEBUG_BUILD &&
      debug.warn(
        `[Profiling] Invalid sample rate. Sample rate must be a boolean or a number between 0 and 1. Got ${JSON.stringify(
          rate,
        )} of type ${JSON.stringify(typeof rate)}.`,
      );
    return false;
  }

  // Boolean sample rates are always valid
  if (rate === true || rate === false) {
    return true;
  }

  // in case sampleRate is a boolean, it will get automatically cast to 1 if it's true and 0 if it's false
  if (rate < 0 || rate > 1) {
    DEBUG_BUILD && debug.warn(`[Profiling] Invalid sample rate. Sample rate must be between 0 and 1. Got ${rate}.`);
    return false;
  }
  return true;
}

// Keep a flag value to avoid re-initializing the profiler constructor. If it fails
// once, it will always fail and this allows us to early return.
let PROFILING_CONSTRUCTOR_FAILED: boolean = false;
export const MAX_PROFILE_DURATION_MS = 30_000;

/**
 * Check if profiler constructor is available.
 * @param maybeProfiler
 */
function isJSProfilerSupported(maybeProfiler: unknown): maybeProfiler is typeof JSSelfProfilerConstructor {
  return typeof maybeProfiler === 'function';
}

/**
 * Starts the profiler and returns the profiler instance.
 */
export function startJSSelfProfile(): JSSelfProfiler | undefined {
  // Feature support check first
  const JSProfilerConstructor = WINDOW.Profiler;

  if (!isJSProfilerSupported(JSProfilerConstructor)) {
    if (DEBUG_BUILD) {
      debug.log('[Profiling] Profiling is not supported by this browser, Profiler interface missing on window object.');
    }
    return;
  }

  // From initial testing, it seems that the minimum value for sampleInterval is 10ms.
  const samplingIntervalMS = 10;
  // Start the profiler
  const maxSamples = Math.floor(MAX_PROFILE_DURATION_MS / samplingIntervalMS);

  // Attempt to initialize the profiler constructor, if it fails, we disable profiling for the current user session.
  // This is likely due to a missing 'Document-Policy': 'js-profiling' header. We do not want to throw an error if this happens
  // as we risk breaking the user's application, so just disable profiling and log an error.
  try {
    return new JSProfilerConstructor({ sampleInterval: samplingIntervalMS, maxBufferSize: maxSamples });
  } catch {
    if (DEBUG_BUILD) {
      debug.log(
        "[Profiling] Failed to initialize the Profiling constructor, this is likely due to a missing 'Document-Policy': 'js-profiling' header.",
      );
      debug.log('[Profiling] Disabling profiling for current user session.');
    }
    PROFILING_CONSTRUCTOR_FAILED = true;
  }

  return;
}

/**
 * Determine if a profile should be created for the current session.
 */
export function shouldProfileSession(options: BrowserOptions): boolean {
  // If constructor failed once, it will always fail, so we can early return.
  if (PROFILING_CONSTRUCTOR_FAILED) {
    if (DEBUG_BUILD) {
      debug.log(
        '[Profiling] Profiling has been disabled for the duration of the current user session as the JS Profiler could not be started.',
      );
    }
    return false;
  }

  if (options.profileLifecycle !== 'trace' && options.profileLifecycle !== 'manual') {
    DEBUG_BUILD && debug.warn('[Profiling] Session not sampled. Invalid `profileLifecycle` option.');
    return false;
  }

  //  Session sampling: profileSessionSampleRate gates whether profiling is enabled for this session
  const profileSessionSampleRate = options.profileSessionSampleRate;

  if (!isValidSampleRate(profileSessionSampleRate)) {
    DEBUG_BUILD && debug.warn('[Profiling] Discarding profile because of invalid profileSessionSampleRate.');
    return false;
  }

  if (!profileSessionSampleRate) {
    DEBUG_BUILD &&
      debug.log('[Profiling] Discarding profile because profileSessionSampleRate is not defined or set to 0');
    return false;
  }

  return Math.random() <= profileSessionSampleRate;
}

export function setThreadAttributes(span: Span): void {
  span.setAttribute('thread.id', PROFILER_THREAD_ID_STRING);
  span.setAttribute('thread.name', PROFILER_THREAD_NAME);
}
