import { getDynamicSamplingContextFromSpan } from './tracing/dynamicSamplingContext';
import type { SentrySpan } from './tracing/sentrySpan';
import type {
  Client,
  DsnComponents,
  DynamicSamplingContext,
  Event,
  EventEnvelope,
  EventItem,
  SdkInfo,
  SdkMetadata,
  Session,
  SessionAggregates,
  SessionEnvelope,
  SessionItem,
  SpanEnvelope,
  SpanItem,
  SpanJSON,
} from './types-hoist';
import { dsnToString } from './utils-hoist/dsn';
import {
  createEnvelope,
  createEventEnvelopeHeaders,
  createSpanEnvelopeItem,
  getSdkMetadataForEnvelopeHeader,
} from './utils-hoist/envelope';
import { showSpanDropWarning, spanToJSON } from './utils/spanUtils';

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
  dsn?: DsnComponents,
  metadata?: SdkMetadata,
  tunnel?: string,
): SessionEnvelope {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);
  const envelopeHeaders = {
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
  };

  const envelopeItem: SessionItem =
    'aggregates' in session ? [{ type: 'sessions' }, session] : [{ type: 'session' }, session.toJSON()];

  return createEnvelope<SessionEnvelope>(envelopeHeaders, [envelopeItem]);
}

/**
 * Create an Envelope from an event.
 */
export function createEventEnvelope(
  event: Event,
  dsn?: DsnComponents,
  metadata?: SdkMetadata,
  tunnel?: string,
): EventEnvelope {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(metadata);

  /*
    Note: Due to TS, event.type may be `replay_event`, theoretically.
    In practice, we never call `createEventEnvelope` with `replay_event` type,
    and we'd have to adjust a looot of types to make this work properly.
    We want to avoid casting this around, as that could lead to bugs (e.g. when we add another type)
    So the safe choice is to really guard against the replay_event type here.
  */
  const eventType = event.type && event.type !== 'replay_event' ? event.type : 'event';

  enhanceEventWithSdkInfo(event, metadata && metadata.sdk);

  const envelopeHeaders = createEventEnvelopeHeaders(event, sdkInfo, tunnel, dsn);

  // Prevent this data (which, if it exists, was used in earlier steps in the processing pipeline) from being sent to
  // sentry. (Note: Our use of this property comes and goes with whatever we might be debugging, whatever hacks we may
  // have temporarily added, etc. Even if we don't happen to be using it at some point in the future, let's not get rid
  // of this `delete`, lest we miss putting it back in the next time the property is in use.)
  delete event.sdkProcessingMetadata;

  const eventItem: EventItem = [{ type: eventType }, event];
  return createEnvelope<EventEnvelope>(envelopeHeaders, [eventItem]);
}

/**
 * Create envelope from Span item.
 *
 * Takes an optional client and runs spans through `beforeSendSpan` if available.
 */
export function createSpanEnvelope(spans: [SentrySpan, ...SentrySpan[]], client?: Client): SpanEnvelope {
  function dscHasRequiredProps(dsc: Partial<DynamicSamplingContext>): dsc is DynamicSamplingContext {
    return !!dsc.trace_id && !!dsc.public_key;
  }

  // For the moment we'll obtain the DSC from the first span in the array
  // This might need to be changed if we permit sending multiple spans from
  // different segments in one envelope
  const dsc = getDynamicSamplingContextFromSpan(spans[0]);

  const dsn = client && client.getDsn();
  const tunnel = client && client.getOptions().tunnel;

  const headers: SpanEnvelope[0] = {
    sent_at: new Date().toISOString(),
    ...(dscHasRequiredProps(dsc) && { trace: dsc }),
    ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
  };

  const beforeSendSpan = client && client.getOptions().beforeSendSpan;
  const convertToSpanJSON = beforeSendSpan
    ? (span: SentrySpan) => {
        const spanJson = beforeSendSpan(spanToJSON(span) as SpanJSON);
        if (!spanJson) {
          showSpanDropWarning();
        }
        return spanJson;
      }
    : (span: SentrySpan) => spanToJSON(span);

  const items: SpanItem[] = [];
  for (const span of spans) {
    const spanJson = convertToSpanJSON(span);
    if (spanJson) {
      items.push(createSpanEnvelopeItem(spanJson));
    }
  }

  return createEnvelope<SpanEnvelope>(headers, items);
}
