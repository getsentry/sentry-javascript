import {
  DsnComponents,
  Event,
  EventEnvelope,
  EventEnvelopeHeaders,
  EventItem,
  SdkInfo,
  SdkMetadata,
  Session,
  SessionAggregates,
  SessionEnvelope,
  SessionItem,
} from '@sentry/types';
import { createEnvelope, dropUndefinedKeys, dsnToString } from '@sentry/utils';

/** Extract sdk info from from the API metadata */
function getSdkMetadataForEnvelopeHeader(metadata?: SdkMetadata): SdkInfo | undefined {
  if (!metadata || !metadata.sdk) {
    return;
  }
  const { name, version } = metadata.sdk;
  return { name, version };
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
  event.sdk.name = event.sdk.name || sdkInfo.name;
  event.sdk.version = event.sdk.version || sdkInfo.version;
  event.sdk.integrations = [...(event.sdk.integrations || []), ...(sdkInfo.integrations || [])];
  event.sdk.packages = [...(event.sdk.packages || []), ...(sdkInfo.packages || [])];
  return event;
}

/** Creates an envelope from a Session */
export function createSessionEnvelope(
  session: Session | SessionAggregates,
  dsn: DsnComponents,
  metadata?: SdkMetadata,
  tunnel?: string,
): SessionEnvelope {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
  const envelopeHeaders = {
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(!!tunnel && { dsn: dsnToString(dsn) }),
  };

  const envelopeItem: SessionItem =
    'aggregates' in session ? [{ type: 'sessions' }, session] : [{ type: 'session' }, session];

  return createEnvelope<SessionEnvelope>(envelopeHeaders, [envelopeItem]);
}

/**
 * Create an Envelope from an event.
 */
export function createEventEnvelope(
  event: Event,
  dsn: DsnComponents,
  metadata?: SdkMetadata,
  tunnel?: string,
): EventEnvelope {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
  const eventType = event.type || 'event';

  const { transactionSampling } = event.sdkProcessingMetadata || {};
  const { method: samplingMethod, rate: sampleRate } = transactionSampling || {};

  // TODO: Below is a temporary hack in order to debug a serialization error - see
  // https://github.com/getsentry/sentry-javascript/issues/2809,
  // https://github.com/getsentry/sentry-javascript/pull/4425, and
  // https://github.com/getsentry/sentry-javascript/pull/4574.
  //
  // TL; DR: even though we normalize all events (which should prevent this), something is causing `JSON.stringify` to
  // throw a circular reference error.
  //
  // When it's time to remove it:
  // 1. Delete everything between here and where the request object `req` is created, EXCEPT the line deleting
  //    `sdkProcessingMetadata`
  // 2. Restore the original version of the request body, which is commented out
  // 3. Search for either of the PR URLs above and pull out the companion hacks in the browser playwright tests and the
  //    baseClient tests in this package
  enhanceEventWithSdkInfo(event, metadata && metadata.sdk);
  event.tags = event.tags || {};
  event.extra = event.extra || {};

  // In theory, all events should be marked as having gone through normalization and so
  // we should never set this tag/extra data
  if (!(event.sdkProcessingMetadata && event.sdkProcessingMetadata.baseClientNormalized)) {
    event.tags.skippedNormalization = true;
    event.extra.normalizeDepth = event.sdkProcessingMetadata ? event.sdkProcessingMetadata.normalizeDepth : 'unset';
  }

  // prevent this data from being sent to sentry
  // TODO: This is NOT part of the hack - DO NOT DELETE
  delete event.sdkProcessingMetadata;

  const envelopeHeaders = createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn);

  const eventItem: EventItem = [
    {
      type: eventType,
      sample_rates: [{ id: samplingMethod, rate: sampleRate }],
    },
    event,
  ];
  return createEnvelope<EventEnvelope>(envelopeHeaders, [eventItem]);
}

function createEventEnvelopeHeaders(
  event: Event,
  sdkInfo: SdkInfo | undefined,
  tunnel: string | undefined,
  dsn: DsnComponents,
): EventEnvelopeHeaders {
  return {
    event_id: event.event_id as string,
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(!!tunnel && { dsn: dsnToString(dsn) }),
    ...(event.type === 'transaction' &&
      event.contexts &&
      event.contexts.trace && {
        trace: dropUndefinedKeys({
          // Trace context must be defined for transactions
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          trace_id: (event.contexts!.trace as Record<string, unknown>).trace_id as string,
          public_key: dsn.publicKey,
          ...event.contexts.baggage,
        }),
      }),
  };
}
