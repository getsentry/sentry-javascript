import type {
  Client,
  ContinuousThreadCpuProfile,
  DebugImage,
  DsnComponents,
  EventEnvelopeHeaders,
  ProfileChunk,
  ProfileChunkEnvelope,
  ProfileChunkItem,
  SdkInfo,
} from '@sentry/core';
import { createEnvelope, debug, dsnToString, getDebugImagesForResources, uuid4 } from '@sentry/core';
import type { RawChunkCpuProfile } from '@sentry/node-cpu-profiler';
import { isMainThread, threadId } from 'worker_threads';
import { DEBUG_BUILD } from './debug-build';

// We require the file because if we import it, it will be included in the bundle.
// I guess tsc does not check file contents when it's imported.
export const PROFILER_THREAD_ID_STRING = String(threadId);
export const PROFILER_THREAD_NAME = isMainThread ? 'main' : 'worker';
const CONTINUOUS_FORMAT_VERSION = '2';

/**
 * Checks if the profile is a raw profile or a profile enriched with thread information.
 * @param {ContinuousThreadCpuProfile | RawChunkCpuProfile} profile
 * @returns {boolean}
 */
function isRawThreadCpuProfile(
  profile: ContinuousThreadCpuProfile | RawChunkCpuProfile,
): profile is RawChunkCpuProfile {
  return !('thread_metadata' in profile);
}

/**
 * Enriches the profile with threadId of the current thread.
 * This is done in node as we seem to not be able to get the info from C native code.
 *
 * @param {ContinuousThreadCpuProfile | RawChunkCpuProfile} profile
 * @returns {ContinuousThreadCpuProfile}
 */
export function enrichWithThreadInformation(
  profile: ContinuousThreadCpuProfile | RawChunkCpuProfile,
): ContinuousThreadCpuProfile {
  if (!isRawThreadCpuProfile(profile)) {
    return profile;
  }

  return {
    samples: profile.samples,
    frames: profile.frames,
    stacks: profile.stacks,
    thread_metadata: {
      [PROFILER_THREAD_ID_STRING]: {
        name: PROFILER_THREAD_NAME,
      },
    },
  };
}

/**
 * Create a profile chunk from raw thread profile
 * @param {RawChunkCpuProfile} cpuProfile
 * @returns {ProfileChunk}
 */
function createProfileChunkPayload(
  client: Client,
  cpuProfile: RawChunkCpuProfile,
  {
    release,
    environment,
    trace_id,
    profiler_id,
    chunk_id,
    sdk,
  }: {
    release: string;
    environment: string;
    trace_id: string | undefined;
    chunk_id: string;
    profiler_id: string;
    sdk: SdkInfo | undefined;
  },
): ProfileChunk {
  // Log a warning if the profile has an invalid traceId (should be uuidv4).
  // All profiles and transactions are rejected if this is the case and we want to
  // warn users that this is happening if they enable debug flag
  if (trace_id?.length !== 32) {
    DEBUG_BUILD && debug.log(`[Profiling] Invalid traceId: ${trace_id} on profiled event`);
  }

  const enrichedThreadProfile = enrichWithThreadInformation(cpuProfile);

  const profile: ProfileChunk = {
    chunk_id: chunk_id,
    client_sdk: {
      name: sdk?.name ?? 'sentry.javascript.node',
      version: sdk?.version ?? '0.0.0',
    },
    profiler_id: profiler_id,
    platform: 'node',
    version: CONTINUOUS_FORMAT_VERSION,
    release: release,
    environment: environment,
    measurements: cpuProfile.measurements,
    debug_meta: {
      images: applyDebugMetadata(client, cpuProfile.resources),
    },
    profile: enrichedThreadProfile,
  };

  return profile;
}

/**
 * Creates a profiling chunk envelope item, if the profile does not pass validation, returns null.
 */
export function createProfilingChunkEvent(
  client: Client,
  options: { release?: string; environment?: string },
  profile: RawChunkCpuProfile,
  sdk: SdkInfo | undefined,
  identifiers: { trace_id: string | undefined; chunk_id: string; profiler_id: string },
): ProfileChunk | null {
  if (!isValidProfileChunk(profile)) {
    return null;
  }

  return createProfileChunkPayload(client, profile, {
    release: options.release ?? '',
    environment: options.environment ?? '',
    trace_id: identifiers.trace_id ?? '',
    chunk_id: identifiers.chunk_id,
    profiler_id: identifiers.profiler_id,
    sdk,
  });
}

/**
 * Checks if the profile chunk is valid and can be sent to Sentry.
 * @param profile
 * @returns
 */
export function isValidProfileChunk(profile: RawChunkCpuProfile): profile is RawChunkCpuProfile {
  if (profile.samples.length <= 1) {
    DEBUG_BUILD &&
      // Log a warning if the profile has less than 2 samples so users can know why
      // they are not seeing any profiling data and we cant avoid the back and forth
      // of asking them to provide us with a dump of the profile data.
      debug.log('[Profiling] Discarding profile chunk because it contains less than 2 samples');
    return false;
  }

  return true;
}

/**
 * Creates event envelope headers for a profile chunk. This is separate from createEventEnvelopeHeaders util
 * as the profile chunk does not conform to the sentry event type
 */
export function createEventEnvelopeHeaders(
  sdkInfo: SdkInfo | undefined,
  tunnel: string | undefined,
  dsn?: DsnComponents,
): EventEnvelopeHeaders {
  return {
    event_id: uuid4(),
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
  };
}

/**
 * Creates a standalone profile_chunk envelope.
 */
export function makeProfileChunkEnvelope(
  platform: 'node',
  chunk: ProfileChunk,
  sdkInfo: SdkInfo | undefined,
  tunnel: string | undefined,
  dsn?: DsnComponents,
): ProfileChunkEnvelope {
  const profileChunkHeader: ProfileChunkItem[0] = {
    type: 'profile_chunk',
    platform,
  };

  return createEnvelope<ProfileChunkEnvelope>(createEventEnvelopeHeaders(sdkInfo, tunnel, dsn), [
    [profileChunkHeader, chunk],
  ]);
}

/**
 * Cross reference profile collected resources with debug_ids and return a list of debug images.
 * @param {string[]} resource_paths
 * @returns {DebugImage[]}
 */
export function applyDebugMetadata(client: Client, resource_paths: ReadonlyArray<string>): DebugImage[] {
  const options = client.getOptions();

  if (!options?.stackParser) {
    return [];
  }

  return getDebugImagesForResources(options.stackParser, resource_paths);
}
