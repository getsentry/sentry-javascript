import { DEFAULT_ENVIRONMENT } from '@sentry/core';
import type {
  DsnComponents,
  DynamicSamplingContext,
  Event,
  EventEnvelope,
  EventEnvelopeHeaders,
  EventItem,
  Profile as SentryProfile,
  SdkInfo,
  SdkMetadata,
  ThreadCpuProfile,
} from '@sentry/types';
import { createEnvelope, dropUndefinedKeys, dsnToString, logger, uuid4 } from '@sentry/utils';

import { WINDOW } from '../helpers';
import type {
  JSSelfProfile,
  JSSelfProfileStack,
  RawThreadCpuProfile,
} from './jsSelfProfiling';

const MS_TO_NS = 1e6;
// Use 0 as main thread id which is identical to threadId in node:worker_threads
// where main logs 0 and workers seem to log in increments of 1
const THREAD_ID_STRING = String(0);
const THREAD_NAME = 'main';

// Machine properties (eval only once)
let OS_PLATFORM = ''; // macos
let OS_PLATFORM_VERSION = ''; // 13.2
let OS_ARCH = ''; // arm64
let OS_BROWSER = (WINDOW.navigator && WINDOW.navigator.userAgent) || '';
let OS_MODEL = '';
const OS_LOCALE =
  (WINDOW.navigator && WINDOW.navigator.language) ||
  (WINDOW.navigator && WINDOW.navigator.languages && WINDOW.navigator.languages[0]) ||
  '';

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

// @ts-ignore userAgentData is not part of the navigator interface yet
const userAgentData = WINDOW.navigator && WINDOW.navigator.userAgentData;

if (isUserAgentData(userAgentData)) {
  userAgentData
    .getHighEntropyValues(['architecture', 'model', 'platform', 'platformVersion', 'fullVersionList'])
    .then((ua: UAData) => {
      OS_PLATFORM = ua.platform || '';
      OS_ARCH = ua.architecture || '';
      OS_MODEL = ua.model || '';
      OS_PLATFORM_VERSION = ua.platformVersion || '';

      if (ua.fullVersionList && ua.fullVersionList.length > 0) {
        const firstUa = ua.fullVersionList[ua.fullVersionList.length - 1];
        OS_BROWSER = `${firstUa.brand} ${firstUa.version}`;
      }
    })
    .catch(e => void e);
}

function isRawThreadCpuProfile(profile: ThreadCpuProfile | RawThreadCpuProfile): profile is RawThreadCpuProfile {
  return !('thread_metadata' in profile);
}

// Enriches the profile with threadId of the current thread.
// This is done in node as we seem to not be able to get the info from C native code.
/**
 *
 */
export function enrichWithThreadInformation(profile: ThreadCpuProfile | RawThreadCpuProfile): ThreadCpuProfile {
  if (!isRawThreadCpuProfile(profile)) {
    return profile;
  }

  return convertJSSelfProfileToSampledFormat(profile);
}

// Profile is marked as optional because it is deleted from the metadata
// by the integration before the event is processed by other integrations.
export interface ProfiledEvent extends Event {
  sdkProcessingMetadata: {
    profile?: RawThreadCpuProfile;
  };
}

/** Extract sdk info from from the API metadata */
function getSdkMetadataForEnvelopeHeader(metadata?: SdkMetadata): SdkInfo | undefined {
  if (!metadata || !metadata.sdk) {
    return undefined;
  }

  return { name: metadata.sdk.name, version: metadata.sdk.version } as SdkInfo;
}

/**
 * Apply SdkInfo (name, version, packages, integrations) to the corresponding event key.
 * Merge with existing data if any.
 **/
function enhanceEventWithSdkInfo(event: Event, sdkInfo?: SdkInfo): Event {
  if (!sdkInfo) {
    return event;
  }
  event.sdk = event.sdk || {};
  event.sdk.name = event.sdk.name || sdkInfo.name || 'unknown sdk';
  event.sdk.version = event.sdk.version || sdkInfo.version || 'unknown sdk version';
  event.sdk.integrations = [...(event.sdk.integrations || []), ...(sdkInfo.integrations || [])];
  event.sdk.packages = [...(event.sdk.packages || []), ...(sdkInfo.packages || [])];
  return event;
}

function createEventEnvelopeHeaders(
  event: Event,
  sdkInfo: SdkInfo | undefined,
  tunnel: string | undefined,
  dsn: DsnComponents,
): EventEnvelopeHeaders {
  const dynamicSamplingContext = event.sdkProcessingMetadata && event.sdkProcessingMetadata['dynamicSamplingContext'];

  return {
    event_id: event.event_id as string,
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(!!tunnel && { dsn: dsnToString(dsn) }),
    ...(event.type === 'transaction' &&
      dynamicSamplingContext && {
        trace: dropUndefinedKeys({ ...dynamicSamplingContext }) as DynamicSamplingContext,
      }),
  };
}

function getTraceId(event: Event): string {
  const traceId: unknown = event && event.contexts && event.contexts['trace'] && event.contexts['trace']['trace_id'];
  // Log a warning if the profile has an invalid traceId (should be uuidv4).
  // All profiles and transactions are rejected if this is the case and we want to
  // warn users that this is happening if they enable debug flag
  if (typeof traceId === 'string' && traceId.length !== 32) {
    if (__DEBUG_BUILD__) {
      logger.log(`[Profiling] Invalid traceId: ${traceId} on profiled event`);
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
export function createProfilingEventEnvelope(
  event: ProfiledEvent,
  dsn: DsnComponents,
  metadata?: SdkMetadata,
  tunnel?: string,
): EventEnvelope | null {
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
    throw new TypeError('Profile is missing profile_id');
  }

  if (rawProfile.samples.length <= 1) {
    if (__DEBUG_BUILD__) {
      // Log a warning if the profile has less than 2 samples so users can know why
      // they are not seeing any profiling data and we cant avoid the back and forth
      // of asking them to provide us with a dump of the profile data.
      logger.log('[Profiling] Discarding profile because it contains less than 2 samples');
    }
    return null;
  }

  const traceId = getTraceId(event);
  const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
  enhanceEventWithSdkInfo(event, metadata && metadata.sdk);
  const envelopeHeaders = createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn);
  const enrichedThreadProfile = enrichWithThreadInformation(rawProfile);
  const transactionStartMs = typeof event.start_timestamp === 'number' ? event.start_timestamp * 1000 : Date.now();
  const transactionEndMs = typeof event.timestamp === 'number' ? event.timestamp * 1000 : Date.now();

  const profile: SentryProfile = {
    event_id: rawProfile.profile_id,
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

  const envelopeItem: EventItem = [
    {
      type: 'profile',
    },
    // @ts-ignore this is missing in typedef
    profile,
  ];

  return createEnvelope<EventEnvelope>(envelopeHeaders, [envelopeItem]);
}

/**
 *
 */
export function isProfiledTransactionEvent(event: Event): event is ProfiledEvent {
  return !!(event.sdkProcessingMetadata && event.sdkProcessingMetadata['profile']);
}

// Due to how profiles are attached to event metadata, we may sometimes want to remove them to ensure
// they are not processed by other Sentry integrations. This can be the case when we cannot construct a valid
// profile from the data we have or some of the mechanisms to send the event (Hub, Transport etc) are not available to us.
/**
 *
 */
export function maybeRemoveProfileFromSdkMetadata(event: Event | ProfiledEvent): Event {
  if (!isProfiledTransactionEvent(event)) {
    return event;
  }

  delete event.sdkProcessingMetadata.profile;
  return event;
}

/**
 * Converts a JSSelfProfile to a our sampled format.
 * Does not currently perform stack indexing.
 */
export function convertJSSelfProfileToSampledFormat(input: JSSelfProfile): ThreadCpuProfile {
  let EMPTY_STACK_ID: undefined | number = undefined;
  let STACK_ID = 0;

  // Initialize the profile that we will fill with data
  const profile: ThreadCpuProfile = {
    samples: [],
    stacks: [],
    frames: [],
    thread_metadata: {
      [THREAD_ID_STRING]: { name: THREAD_NAME },
    },
  };

  if (!input.samples.length) {
    return profile;
  }

  // We assert samples.length > 0 above and timestamp should always be present
  const start = input.samples[0].timestamp;

  for (let i = 0; i < input.samples.length; i++) {
    const jsSample = input.samples[i];

    // If sample has no stack, add an empty sample
    if (jsSample.stackId === undefined) {
      if (EMPTY_STACK_ID === undefined) {
        EMPTY_STACK_ID = STACK_ID;
        profile.stacks[EMPTY_STACK_ID] = [];
        STACK_ID++;
      }

      profile['samples'][i] = {
        // convert ms timestamp to ns
        elapsed_since_start_ns: ((jsSample.timestamp - start) * MS_TO_NS).toFixed(0),
        stack_id: EMPTY_STACK_ID,
        thread_id: THREAD_ID_STRING,
      };
      continue;
    }

    let stackTop: JSSelfProfileStack | undefined = input.stacks[jsSample.stackId];

    // Functions in top->down order (root is last)
    // We follow the stackTop.parentId trail and collect each visited frameId
    const stack: number[] = [];

    while (stackTop) {
      stack.push(stackTop.frameId);

      const frame = input.frames[stackTop.frameId];

      // If our frame has not been indexed yet, index it
      if (profile.frames[stackTop.frameId] === undefined) {
        profile.frames[stackTop.frameId] = {
          function: frame.name,
          file: frame.resourceId ? input.resources[frame.resourceId] : undefined,
          line: frame.line,
          column: frame.column,
        };
      }

      stackTop = stackTop.parentId === undefined ? undefined : input.stacks[stackTop.parentId];
    }

    const sample: ThreadCpuProfile['samples'][0] = {
      // convert ms timestamp to ns
      elapsed_since_start_ns: ((jsSample.timestamp - start) * MS_TO_NS).toFixed(0),
      stack_id: STACK_ID,
      thread_id: THREAD_ID_STRING,
    };

    profile['stacks'][STACK_ID] = stack;
    profile['samples'][i] = sample;
    STACK_ID++;
  }

  return profile;
}
