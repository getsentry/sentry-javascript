/* eslint-disable max-lines */
import type { DebugImage, Envelope, Event, EventEnvelope, Profile, Span, ThreadCpuProfile } from '@sentry/core';
import {
  browserPerformanceTimeOrigin,
  debug,
  DEFAULT_ENVIRONMENT,
  forEachEnvelopeItem,
  getClient,
  getDebugImagesForResources,
  spanToJSON,
  timestampInSeconds,
  uuid4,
} from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';
import { WINDOW } from '../helpers';
import type { JSSelfProfile, JSSelfProfiler, JSSelfProfilerConstructor, JSSelfProfileStack } from './jsSelfProfiling';

const MS_TO_NS = 1e6;
// Use 0 as main thread id which is identical to threadId in node:worker_threads
// where main logs 0 and workers seem to log in increments of 1
const THREAD_ID_STRING = String(0);
const THREAD_NAME = 'main';

// We force make this optional to be on the safe side...
const navigator = WINDOW.navigator as typeof WINDOW.navigator | undefined;

// Machine properties (eval only once)
let OS_PLATFORM = '';
let OS_PLATFORM_VERSION = '';
let OS_ARCH = '';
let OS_BROWSER = navigator?.userAgent || '';
let OS_MODEL = '';
const OS_LOCALE = navigator?.language || navigator?.languages?.[0] || '';

type UAData = {
  platform?: string;
  architecture?: string;
  model?: string;
  platformVersion?: string;
  fullVersionList?: {
    brand: string;
    version: string;
  }[];
};

interface UserAgentData {
  getHighEntropyValues: (keys: string[]) => Promise<UAData>;
}

function isUserAgentData(data: unknown): data is UserAgentData {
  return typeof data === 'object' && data !== null && 'getHighEntropyValues' in data;
}

// @ts-expect-error userAgentData is not part of the navigator interface yet
const userAgentData = navigator?.userAgentData;

if (isUserAgentData(userAgentData)) {
  userAgentData
    .getHighEntropyValues(['architecture', 'model', 'platform', 'platformVersion', 'fullVersionList'])
    .then((ua: UAData) => {
      OS_PLATFORM = ua.platform || '';
      OS_ARCH = ua.architecture || '';
      OS_MODEL = ua.model || '';
      OS_PLATFORM_VERSION = ua.platformVersion || '';

      if (ua.fullVersionList?.length) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const firstUa = ua.fullVersionList[ua.fullVersionList.length - 1]!;
        OS_BROWSER = `${firstUa.brand} ${firstUa.version}`;
      }
    })
    .catch(e => void e);
}

function isProcessedJSSelfProfile(profile: ThreadCpuProfile | JSSelfProfile): profile is JSSelfProfile {
  return !('thread_metadata' in profile);
}

// Enriches the profile with threadId of the current thread.
// This is done in node as we seem to not be able to get the info from C native code.
/**
 *
 */
export function enrichWithThreadInformation(profile: ThreadCpuProfile | JSSelfProfile): ThreadCpuProfile {
  if (!isProcessedJSSelfProfile(profile)) {
    return profile;
  }

  return convertJSSelfProfileToSampledFormat(profile);
}

// Profile is marked as optional because it is deleted from the metadata
// by the integration before the event is processed by other integrations.
export interface ProfiledEvent extends Event {
  sdkProcessingMetadata: {
    profile?: JSSelfProfile;
  };
}

function getTraceId(event: Event): string {
  const traceId: unknown = event.contexts?.trace?.trace_id;
  // Log a warning if the profile has an invalid traceId (should be uuidv4).
  // All profiles and transactions are rejected if this is the case and we want to
  // warn users that this is happening if they enable debug flag
  if (typeof traceId === 'string' && traceId.length !== 32) {
    if (DEBUG_BUILD) {
      debug.log(`[Profiling] Invalid traceId: ${traceId} on profiled event`);
    }
  }
  if (typeof traceId !== 'string') {
    return '';
  }

  return traceId;
}
/**
 * Creates a profiling event envelope from a Sentry event. If profile does not pass
 * validation, returns null.
 * @param event
 * @param dsn
 * @param metadata
 * @param tunnel
 * @returns {EventEnvelope | null}
 */

/**
 * Creates a profiling event envelope from a Sentry event.
 */
export function createProfilePayload(
  profile_id: string,
  start_timestamp: number | undefined,
  processed_profile: JSSelfProfile,
  event: ProfiledEvent,
): Profile {
  if (event.type !== 'transaction') {
    // createProfilingEventEnvelope should only be called for transactions,
    // we type guard this behavior with isProfiledTransactionEvent.
    throw new TypeError('Profiling events may only be attached to transactions, this should never occur.');
  }

  if (processed_profile === undefined || processed_profile === null) {
    throw new TypeError(
      `Cannot construct profiling event envelope without a valid profile. Got ${processed_profile} instead.`,
    );
  }

  const traceId = getTraceId(event);
  const enrichedThreadProfile = enrichWithThreadInformation(processed_profile);
  const transactionStartMs = start_timestamp
    ? start_timestamp
    : typeof event.start_timestamp === 'number'
      ? event.start_timestamp * 1000
      : timestampInSeconds() * 1000;
  const transactionEndMs = typeof event.timestamp === 'number' ? event.timestamp * 1000 : timestampInSeconds() * 1000;

  const profile: Profile = {
    event_id: profile_id,
    timestamp: new Date(transactionStartMs).toISOString(),
    platform: 'javascript',
    version: '1',
    release: event.release || '',
    environment: event.environment || DEFAULT_ENVIRONMENT,
    runtime: {
      name: 'javascript',
      version: WINDOW.navigator.userAgent,
    },
    os: {
      name: OS_PLATFORM,
      version: OS_PLATFORM_VERSION,
      build_number: OS_BROWSER,
    },
    device: {
      locale: OS_LOCALE,
      model: OS_MODEL,
      manufacturer: OS_BROWSER,
      architecture: OS_ARCH,
      is_emulator: false,
    },
    debug_meta: {
      images: applyDebugMetadata(processed_profile.resources),
    },
    profile: enrichedThreadProfile,
    transactions: [
      {
        name: event.transaction || '',
        id: event.event_id || uuid4(),
        trace_id: traceId,
        active_thread_id: THREAD_ID_STRING,
        relative_start_ns: '0',
        relative_end_ns: ((transactionEndMs - transactionStartMs) * 1e6).toFixed(0),
      },
    ],
  };

  return profile;
}

/**
 *
 */
export function isProfiledTransactionEvent(event: Event): event is ProfiledEvent {
  return !!event.sdkProcessingMetadata?.profile;
}

/*
  See packages/browser-utils/src/browser/router.ts
*/
/**
 *
 */
export function isAutomatedPageLoadSpan(span: Span): boolean {
  return spanToJSON(span).op === 'pageload';
}

/**
 * Converts a JSSelfProfile to a our sampled format.
 * Does not currently perform stack indexing.
 */
export function convertJSSelfProfileToSampledFormat(input: JSSelfProfile): Profile['profile'] {
  let EMPTY_STACK_ID: undefined | number = undefined;
  let STACK_ID = 0;

  // Initialize the profile that we will fill with data
  const profile: Profile['profile'] = {
    samples: [],
    stacks: [],
    frames: [],
    thread_metadata: {
      [THREAD_ID_STRING]: { name: THREAD_NAME },
    },
  };

  const firstSample = input.samples[0];
  if (!firstSample) {
    return profile;
  }

  // We assert samples.length > 0 above and timestamp should always be present
  const start = firstSample.timestamp;
  // The JS SDK might change it's time origin based on some heuristic (see See packages/utils/src/time.ts)
  // when that happens, we need to ensure we are correcting the profile timings so the two timelines stay in sync.
  // Since JS self profiling time origin is always initialized to performance.timeOrigin, we need to adjust for
  // the drift between the SDK selected value and our profile time origin.
  const perfOrigin = browserPerformanceTimeOrigin();
  const origin = typeof performance.timeOrigin === 'number' ? performance.timeOrigin : perfOrigin || 0;
  const adjustForOriginChange = origin - (perfOrigin || origin);

  input.samples.forEach((jsSample, i) => {
    // If sample has no stack, add an empty sample
    if (jsSample.stackId === undefined) {
      if (EMPTY_STACK_ID === undefined) {
        EMPTY_STACK_ID = STACK_ID;
        profile.stacks[EMPTY_STACK_ID] = [];
        STACK_ID++;
      }

      profile['samples'][i] = {
        // convert ms timestamp to ns
        elapsed_since_start_ns: ((jsSample.timestamp + adjustForOriginChange - start) * MS_TO_NS).toFixed(0),
        stack_id: EMPTY_STACK_ID,
        thread_id: THREAD_ID_STRING,
      };
      return;
    }

    let stackTop: JSSelfProfileStack | undefined = input.stacks[jsSample.stackId];

    // Functions in top->down order (root is last)
    // We follow the stackTop.parentId trail and collect each visited frameId
    const stack: number[] = [];

    while (stackTop) {
      stack.push(stackTop.frameId);

      const frame = input.frames[stackTop.frameId];

      // If our frame has not been indexed yet, index it
      if (frame && profile.frames[stackTop.frameId] === undefined) {
        profile.frames[stackTop.frameId] = {
          function: frame.name,
          abs_path: typeof frame.resourceId === 'number' ? input.resources[frame.resourceId] : undefined,
          lineno: frame.line,
          colno: frame.column,
        };
      }

      stackTop = stackTop.parentId === undefined ? undefined : input.stacks[stackTop.parentId];
    }

    const sample: Profile['profile']['samples'][0] = {
      // convert ms timestamp to ns
      elapsed_since_start_ns: ((jsSample.timestamp + adjustForOriginChange - start) * MS_TO_NS).toFixed(0),
      stack_id: STACK_ID,
      thread_id: THREAD_ID_STRING,
    };

    profile['stacks'][STACK_ID] = stack;
    profile['samples'][i] = sample;
    STACK_ID++;
  });

  return profile;
}

/**
 * Adds items to envelope if they are not already present - mutates the envelope.
 * @param envelope
 */
export function addProfilesToEnvelope(envelope: EventEnvelope, profiles: Profile[]): Envelope {
  if (!profiles.length) {
    return envelope;
  }

  for (const profile of profiles) {
    envelope[1].push([{ type: 'profile' }, profile]);
  }
  return envelope;
}

/**
 * Finds transactions with profile_id context in the envelope
 * @param envelope
 * @returns
 */
export function findProfiledTransactionsFromEnvelope(envelope: Envelope): Event[] {
  const events: Event[] = [];

  forEachEnvelopeItem(envelope, (item, type) => {
    if (type !== 'transaction') {
      return;
    }

    for (let j = 1; j < item.length; j++) {
      const event = item[j] as Event;

      if (event?.contexts?.profile?.profile_id) {
        events.push(item[j] as Event);
      }
    }
  });

  return events;
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

function isValidProfile(profile: JSSelfProfile): profile is JSSelfProfile & { profile_id: string } {
  if (profile.samples.length < 2) {
    if (DEBUG_BUILD) {
      // Log a warning if the profile has less than 2 samples so users can know why
      // they are not seeing any profiling data and we cant avoid the back and forth
      // of asking them to provide us with a dump of the profile data.
      debug.log('[Profiling] Discarding profile because it contains less than 2 samples');
    }
    return false;
  }

  if (!profile.frames.length) {
    if (DEBUG_BUILD) {
      debug.log('[Profiling] Discarding profile because it contains no frames');
    }
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
  } catch (e) {
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
 * Determine if a profile should be profiled.
 */
export function shouldProfileSpan(span: Span): boolean {
  // If constructor failed once, it will always fail, so we can early return.
  if (PROFILING_CONSTRUCTOR_FAILED) {
    if (DEBUG_BUILD) {
      debug.log('[Profiling] Profiling has been disabled for the duration of the current user session.');
    }
    return false;
  }

  if (!span.isRecording()) {
    if (DEBUG_BUILD) {
      debug.log('[Profiling] Discarding profile because transaction was not sampled.');
    }
    return false;
  }

  const client = getClient();
  const options = client?.getOptions();
  if (!options) {
    DEBUG_BUILD && debug.log('[Profiling] Profiling disabled, no options found.');
    return false;
  }

  // @ts-expect-error profilesSampleRate is not part of the browser options yet
  const profilesSampleRate: number | boolean | undefined = options.profilesSampleRate;

  // Since this is coming from the user (or from a function provided by the user), who knows what we might get. (The
  // only valid values are booleans or numbers between 0 and 1.)
  if (!isValidSampleRate(profilesSampleRate)) {
    DEBUG_BUILD && debug.warn('[Profiling] Discarding profile because of invalid sample rate.');
    return false;
  }

  // if the function returned 0 (or false), or if `profileSampleRate` is 0, it's a sign the profile should be dropped
  if (!profilesSampleRate) {
    DEBUG_BUILD &&
      debug.log(
        '[Profiling] Discarding profile because a negative sampling decision was inherited or profileSampleRate is set to 0',
      );
    return false;
  }

  // Now we roll the dice. Math.random is inclusive of 0, but not of 1, so strict < is safe here. In case sampleRate is
  // a boolean, the < comparison will cause it to be automatically cast to 1 if it's true and 0 if it's false.
  const sampled = profilesSampleRate === true ? true : Math.random() < profilesSampleRate;
  // Check if we should sample this profile
  if (!sampled) {
    DEBUG_BUILD &&
      debug.log(
        `[Profiling] Discarding profile because it's not included in the random sample (sampling rate = ${Number(
          profilesSampleRate,
        )})`,
      );
    return false;
  }

  return true;
}

/**
 * Creates a profiling envelope item, if the profile does not pass validation, returns null.
 * @param event
 * @returns {Profile | null}
 */
export function createProfilingEvent(
  profile_id: string,
  start_timestamp: number | undefined,
  profile: JSSelfProfile,
  event: ProfiledEvent,
): Profile | null {
  if (!isValidProfile(profile)) {
    return null;
  }

  return createProfilePayload(profile_id, start_timestamp, profile, event);
}

// TODO (v8): We need to obtain profile ids in @sentry-internal/tracing,
// but we don't have access to this map because importing this map would
// cause a circular dependency. We need to resolve this in v8.
const PROFILE_MAP: Map<string, JSSelfProfile> = new Map();
/**
 *
 */
export function getActiveProfilesCount(): number {
  return PROFILE_MAP.size;
}

/**
 * Retrieves profile from global cache and removes it.
 */
export function takeProfileFromGlobalCache(profile_id: string): JSSelfProfile | undefined {
  const profile = PROFILE_MAP.get(profile_id);
  if (profile) {
    PROFILE_MAP.delete(profile_id);
  }
  return profile;
}
/**
 * Adds profile to global cache and evicts the oldest profile if the cache is full.
 */
export function addProfileToGlobalCache(profile_id: string, profile: JSSelfProfile): void {
  PROFILE_MAP.set(profile_id, profile);

  if (PROFILE_MAP.size > 30) {
    const last: string = PROFILE_MAP.keys().next().value;
    PROFILE_MAP.delete(last);
  }
}
