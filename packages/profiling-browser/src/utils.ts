import type {
  DsnComponents,
  DynamicSamplingContext,
  Event,
  EventEnvelope,
  EventEnvelopeHeaders,
  EventItem,
  SdkInfo,
  SdkMetadata,
} from '@sentry/types';
import { createEnvelope, dropUndefinedKeys, dsnToString, logger, uuid4 } from '@sentry/utils';

import type { RawThreadCpuProfile, ThreadCpuProfile } from './jsSelfProfiling';
import { JSSelfProfile, JSSelfProfileStack } from './jsSelfProfiling';

const THREAD_ID_STRING = String(0);
const THREAD_NAME = 'main';

// Machine properties (eval only once)
const OS_PLATFORM = 'PLACEHOLDER_PLATFORM';
const OS_RELEASE = 'PLACEHOLDER_RELEASE';
const OS_VERSION = 'PLACEHOLDER_VERSION';
const OS_TYPE = 'PLACEHOLDER_TYPE';
const OS_MODEL = 'PLACEHOLDER_MODEL';
const OS_ARCH = 'PLACEHOLDER_ARCH';

export interface Profile {
  event_id: string;
  version: string;
  os: {
    name: string;
    version: string;
    build_number: string;
  };
  runtime: {
    name: string;
    version: string;
  };
  device: {
    architecture: string;
    is_emulator: boolean;
    locale: string;
    manufacturer: string;
    model: string;
  };
  timestamp: string;
  release: string;
  environment: string;
  platform: string;
  profile: ThreadCpuProfile;
  debug_meta?: {
    images: {
      debug_id: string;
      image_addr: string;
      code_file: string;
      type: string;
      image_size: number;
      image_vmaddr: string;
    }[];
  };
  transactions: {
    name: string;
    trace_id: string;
    id: string;
    active_thread_id: string;
    relative_start_ns: string;
    relative_end_ns: string;
  }[];
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

/**
 * Creates a profiling event envelope from a Sentry event. If profile does not pass
 * validation, returns null.
 * @param event
 * @param dsn
 * @param metadata
 * @param tunnel
 * @returns {EventEnvelope | null}
 */
// We will live dangerously and disable complexity here, time is of the essence.
// Onwards to the next refactor my fellow engineers!
// eslint-disable-next-line complexity
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

  const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
  enhanceEventWithSdkInfo(event, metadata && metadata.sdk);
  const envelopeHeaders = createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn);
  const enrichedThreadProfile = enrichWithThreadInformation(rawProfile);
  const transactionStartMs = typeof event.start_timestamp === 'number' ? event.start_timestamp * 1000 : Date.now();
  const transactionEndMs = typeof event.timestamp === 'number' ? event.timestamp * 1000 : Date.now();

  const traceId = (event?.contexts?.['trace']?.['trace_id'] as string) || '';
  // Log a warning if the profile has an invalid traceId (should be uuidv4).
  // All profiles and transactions are rejected if this is the case and we want to
  // warn users that this is happening if they enable debug flag
  if (traceId.length !== 32) {
    if (__DEBUG_BUILD__) {
      logger.log(`[Profiling] Invalid traceId: ${traceId} on profiled event`);
    }
  }

  const profile: Profile = {
    event_id: rawProfile.profile_id,
    timestamp: new Date(transactionStartMs).toISOString(),
    platform: 'node', // @TODO replace with browser once backend supports it
    version: '1',
    release: event.release || '',
    environment: event.environment || '',
    runtime: {
      name: 'node', // @TODO replace with browser once backend supports it
      version: process.versions.node || '', // @TODO replace with browser once backend supports it
    },
    os: {
      name: OS_PLATFORM,
      version: OS_RELEASE,
      build_number: OS_VERSION,
    },
    device: {
      locale:
        process.env['LC_ALL'] || process.env['LC_MESSAGES'] || process.env['LANG'] || process.env['LANGUAGE'] || '',
      model: OS_MODEL,
      manufacturer: OS_TYPE,
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
 *
 */
export function convertJSSelfProfileToSampledFormat(input: JSSelfProfile): ThreadCpuProfile {
  const profile: ThreadCpuProfile = {
    samples: [],
    stacks: [],
    frames: [],
    thread_metadata: {
      [THREAD_ID_STRING]: { name: THREAD_NAME },
    },
  };

  for (let i = 0; i < input.samples.length; i++) {
    const jsSample = input.samples[i];

    let stackTop: JSSelfProfileStack | undefined = input.stacks[jsSample.stackId];

    // Frame index pointers in top->down order
    const stack: number[] = [];
    while (stackTop) {
      stack.push(stackTop.frameId);
      stackTop = stackTop.parentId === undefined ? undefined : input.stacks[stackTop.parentId];
    }

    const sample: ThreadCpuProfile['samples'][0] = {
      elapsed_since_start_ns: jsSample.timestamp,
      stack: jsSample.stackId,
      thread_id: THREAD_ID_STRING,
    };

    profile['stacks'][i] = stack.reverse();
    profile['samples'][i] = sample;
  }

  return profile;
}
