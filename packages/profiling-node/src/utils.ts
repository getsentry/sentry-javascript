import * as os from 'os';
import type { Context, Envelope, Event, StackFrame, StackParser } from '@sentry/types';
import { env, versions } from 'process';
import { isMainThread, threadId } from 'worker_threads';

import * as Sentry from '@sentry/node-experimental';
import { GLOBAL_OBJ, forEachEnvelopeItem, logger } from '@sentry/utils';

import { DEBUG_BUILD } from './debug-build';
import type { Profile, ProfiledEvent, RawThreadCpuProfile, ThreadCpuProfile } from './types';
import type { DebugImage } from './types';

// We require the file because if we import it, it will be included in the bundle.
// I guess tsc does not check file contents when it's imported.
const THREAD_ID_STRING = String(threadId);
const THREAD_NAME = isMainThread ? 'main' : 'worker';
const FORMAT_VERSION = '1';

// Os machine was backported to 16.18, but this was not reflected in the types
// @ts-expect-error ignore missing
const machine = typeof os.machine === 'function' ? os.machine() : os.arch();

// Machine properties (eval only once)
const PLATFORM = os.platform();
const RELEASE = os.release();
const VERSION = os.version();
const TYPE = os.type();
const MODEL = machine;
const ARCH = os.arch();

/**
 * Checks if the profile is a raw profile or a profile enriched with thread information.
 * @param {ThreadCpuProfile | RawThreadCpuProfile} profile
 * @returns {boolean}
 */
function isRawThreadCpuProfile(profile: ThreadCpuProfile | RawThreadCpuProfile): profile is RawThreadCpuProfile {
  return !('thread_metadata' in profile);
}

/**
 * Enriches the profile with threadId of the current thread.
 * This is done in node as we seem to not be able to get the info from C native code.
 *
 * @param {ThreadCpuProfile | RawThreadCpuProfile} profile
 * @returns {ThreadCpuProfile}
 */
export function enrichWithThreadInformation(profile: ThreadCpuProfile | RawThreadCpuProfile): ThreadCpuProfile {
  if (!isRawThreadCpuProfile(profile)) {
    return profile;
  }

  return {
    samples: profile.samples,
    frames: profile.frames,
    stacks: profile.stacks,
    thread_metadata: {
      [THREAD_ID_STRING]: {
        name: THREAD_NAME,
      },
    },
  };
}

/**
 * Creates a profiling event envelope from a Sentry event. If profile does not pass
 * validation, returns null.
 * @param {Event}
 * @returns {Profile | null}
 */
export function createProfilingEventFromTransaction(event: ProfiledEvent): Profile | null {
  if (event.type !== 'transaction') {
    // createProfilingEventEnvelope should only be called for transactions,
    // we type guard this behavior with isProfiledTransactionEvent.
    throw new TypeError('Profiling events may only be attached to transactions, this should never occur.');
  }

  const rawProfile = event.sdkProcessingMetadata['profile'];
  if (rawProfile === undefined || rawProfile === null) {
    throw new TypeError(
      `Cannot construct profiling event envelope without a valid profile. Got ${rawProfile} instead.`,
    );
  }

  if (!rawProfile.profile_id) {
    throw new TypeError(
      `Cannot construct profiling event envelope without a valid profile id. Got ${rawProfile.profile_id} instead.`,
    );
  }

  if (!isValidProfile(rawProfile)) {
    return null;
  }

  return createProfilePayload(rawProfile, {
    release: event.release ?? '',
    environment: event.environment ?? '',
    event_id: event.event_id ?? '',
    transaction: event.transaction ?? '',
    start_timestamp: event.start_timestamp ? event.start_timestamp * 1000 : Date.now(),
    trace_id: event.contexts?.['trace']?.['trace_id'] ?? '',
    profile_id: rawProfile.profile_id,
  });
}

/**
 * Creates a profiling envelope item, if the profile does not pass validation, returns null.
 * @param {RawThreadCpuProfile}
 * @param {Event}
 * @returns {Profile | null}
 */
export function createProfilingEvent(profile: RawThreadCpuProfile, event: Event): Profile | null {
  if (!isValidProfile(profile)) {
    return null;
  }

  return createProfilePayload(profile, {
    release: event.release ?? '',
    environment: event.environment ?? '',
    event_id: event.event_id ?? '',
    transaction: event.transaction ?? '',
    start_timestamp: event.start_timestamp ? event.start_timestamp * 1000 : Date.now(),
    trace_id: event.contexts?.['trace']?.['trace_id'] ?? '',
    profile_id: profile.profile_id,
  });
}

/**
 * Create a profile
 * @param {RawThreadCpuProfile} cpuProfile
 * @param {options}
 * @returns {Profile}
 */

function createProfilePayload(
  cpuProfile: RawThreadCpuProfile,
  {
    release,
    environment,
    event_id,
    transaction,
    start_timestamp,
    trace_id,
    profile_id,
  }: {
    release: string;
    environment: string;
    event_id: string;
    transaction: string;
    start_timestamp: number;
    trace_id: string | undefined;
    profile_id: string;
  },
): Profile {
  // Log a warning if the profile has an invalid traceId (should be uuidv4).
  // All profiles and transactions are rejected if this is the case and we want to
  // warn users that this is happening if they enable debug flag
  if (trace_id && trace_id.length !== 32) {
    DEBUG_BUILD && logger.log(`[Profiling] Invalid traceId: ${trace_id} on profiled event`);
  }

  const enrichedThreadProfile = enrichWithThreadInformation(cpuProfile);

  const profile: Profile = {
    event_id: profile_id,
    timestamp: new Date(start_timestamp).toISOString(),
    platform: 'node',
    version: FORMAT_VERSION,
    release: release,
    environment: environment,
    measurements: cpuProfile.measurements,
    runtime: {
      name: 'node',
      version: versions.node || '',
    },
    os: {
      name: PLATFORM,
      version: RELEASE,
      build_number: VERSION,
    },
    device: {
      locale: env['LC_ALL'] || env['LC_MESSAGES'] || env['LANG'] || env['LANGUAGE'] || '',
      model: MODEL,
      manufacturer: TYPE,
      architecture: ARCH,
      is_emulator: false,
    },
    debug_meta: {
      images: applyDebugMetadata(cpuProfile.resources),
    },
    profile: enrichedThreadProfile,
    transaction: {
      name: transaction,
      id: event_id,
      trace_id: trace_id || '',
      active_thread_id: THREAD_ID_STRING,
    },
  };

  return profile;
}

/**
 * Checks the given sample rate to make sure it is valid type and value (a boolean, or a number between 0 and 1).
 * @param {unknown} rate
 * @returns {boolean}
 */
export function isValidSampleRate(rate: unknown): boolean {
  // we need to check NaN explicitly because it's of type 'number' and therefore wouldn't get caught by this typecheck
  if ((typeof rate !== 'number' && typeof rate !== 'boolean') || (typeof rate === 'number' && isNaN(rate))) {
    DEBUG_BUILD &&
      logger.warn(
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
    DEBUG_BUILD && logger.warn(`[Profiling] Invalid sample rate. Sample rate must be between 0 and 1. Got ${rate}.`);
    return false;
  }
  return true;
}

/**
 * Checks if the profile is valid and can be sent to Sentry.
 * @param {RawThreadCpuProfile} profile
 * @returns {boolean}
 */
export function isValidProfile(profile: RawThreadCpuProfile): profile is RawThreadCpuProfile & { profile_id: string } {
  if (profile.samples.length <= 1) {
    DEBUG_BUILD &&
      // Log a warning if the profile has less than 2 samples so users can know why
      // they are not seeing any profiling data and we cant avoid the back and forth
      // of asking them to provide us with a dump of the profile data.
      logger.log('[Profiling] Discarding profile because it contains less than 2 samples');
    return false;
  }

  if (!profile.profile_id) {
    return false;
  }

  return true;
}

/**
 * Adds items to envelope if they are not already present - mutates the envelope.
 * @param {Envelope} envelope
 * @param {Profile[]} profiles
 * @returns {Envelope}
 */
export function addProfilesToEnvelope(envelope: Envelope, profiles: Profile[]): Envelope {
  if (!profiles.length) {
    return envelope;
  }

  for (const profile of profiles) {
    // @ts-expect-error untyped envelope
    envelope[1].push([{ type: 'profile' }, profile]);
  }
  return envelope;
}

/**
 * Finds transactions with profile_id context in the envelope
 * @param {Envelope} envelope
 * @returns {Event[]}
 */
export function findProfiledTransactionsFromEnvelope(envelope: Envelope): Event[] {
  const events: Event[] = [];

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type !== 'transaction') {
      return;
    }

    // First item is the type, so we can skip it, everything else is an event
    for (let j = 1; j < item.length; j++) {
      const event = item[j];

      if (!event) {
        // Shouldnt happen, but lets be safe
        continue;
      }

      // @ts-expect-error profile_id is not part of the metadata type
      const profile_id = (event.contexts as Context)?.['profile']?.['profile_id'];

      if (event && profile_id) {
        events.push(item[j] as Event);
      }
    }
  });

  return events;
}

const debugIdStackParserCache = new WeakMap<StackParser, Map<string, StackFrame[]>>();

/**
 * Cross reference profile collected resources with debug_ids and return a list of debug images.
 * @param {string[]} resource_paths
 * @returns {DebugImage[]}
 */
export function applyDebugMetadata(resource_paths: ReadonlyArray<string>): DebugImage[] {
  const debugIdMap = GLOBAL_OBJ._sentryDebugIds;

  if (!debugIdMap) {
    return [];
  }

  // eslint-disable-next-line deprecation/deprecation
  const hub = Sentry.getCurrentHub();
  // eslint-disable-next-line deprecation/deprecation
  const client = hub.getClient();
  const options = client && client.getOptions();

  if (!options || !options.stackParser) {
    return [];
  }

  let debugIdStackFramesCache: Map<string, StackFrame[]>;
  const cachedDebugIdStackFrameCache = debugIdStackParserCache.get(options.stackParser);
  if (cachedDebugIdStackFrameCache) {
    debugIdStackFramesCache = cachedDebugIdStackFrameCache;
  } else {
    debugIdStackFramesCache = new Map<string, StackFrame[]>();
    debugIdStackParserCache.set(options.stackParser, debugIdStackFramesCache);
  }

  // Build a map of filename -> debug_id.
  const filenameDebugIdMap = Object.keys(debugIdMap).reduce<Record<string, string>>((acc, debugIdStackTrace) => {
    let parsedStack: StackFrame[];

    const cachedParsedStack = debugIdStackFramesCache.get(debugIdStackTrace);
    if (cachedParsedStack) {
      parsedStack = cachedParsedStack;
    } else {
      parsedStack = options.stackParser(debugIdStackTrace);
      debugIdStackFramesCache.set(debugIdStackTrace, parsedStack);
    }

    for (let i = parsedStack.length - 1; i >= 0; i--) {
      const stackFrame = parsedStack[i];
      const file = stackFrame && stackFrame.filename;

      if (stackFrame && file) {
        acc[file] = debugIdMap[debugIdStackTrace] as string;
        break;
      }
    }
    return acc;
  }, {});

  const images: DebugImage[] = [];

  for (const resource of resource_paths) {
    if (resource && filenameDebugIdMap[resource]) {
      images.push({
        type: 'sourcemap',
        code_file: resource,
        debug_id: filenameDebugIdMap[resource] as string,
      });
    }
  }

  return images;
}
