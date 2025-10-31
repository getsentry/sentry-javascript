import type { Client } from './client';
import { getDynamicSamplingContextFromSpan } from './tracing/dynamicSamplingContext';
import type { SentrySpan } from './tracing/sentrySpan';
import type { LegacyCSPReport } from './types-hoist/csp';
import type { DsnComponents } from './types-hoist/dsn';
import type {
  DynamicSamplingContext,
  EventEnvelope,
  EventItem,
  RawSecurityEnvelope,
  RawSecurityItem,
  SessionEnvelope,
  SessionItem,
  SpanEnvelope,
  SpanItem,
} from './types-hoist/envelope';
import type { Event } from './types-hoist/event';
import type { SdkInfo } from './types-hoist/sdkinfo';
import type { SdkMetadata } from './types-hoist/sdkmetadata';
import type { Session, SessionAggregates } from './types-hoist/session';
import { isV2BeforeSendSpanCallback } from './utils/beforeSendSpan';
import { dsnToString } from './utils/dsn';
import {
  createEnvelope,
  createEventEnvelopeHeaders,
  createSpanEnvelopeItem,
  getSdkMetadataForEnvelopeHeader,
} from './utils/envelope';
import { uuid4 } from './utils/misc';
import { shouldIgnoreSpan } from './utils/should-ignore-span';
import { showSpanDropWarning, spanToJSON } from './utils/spanUtils';

/**
 * Apply SdkInfo (name, version, packages, integrations) to the corresponding event key.
 * Merge with existing data if any.
 *
 * @internal, exported only for testing
 **/
export function _enhanceEventWithSdkInfo(event: Event, newSdkInfo?: SdkInfo): Event {
  if (!newSdkInfo) {
    return event;
  }

  const eventSdkInfo = event.sdk || {};

  event.sdk = {
    ...eventSdkInfo,
    name: eventSdkInfo.name || newSdkInfo.name,
    version: eventSdkInfo.version || newSdkInfo.version,
    integrations: [...(event.sdk?.integrations || []), ...(newSdkInfo.integrations || [])],
    packages: [...(event.sdk?.packages || []), ...(newSdkInfo.packages || [])],
    settings:
      event.sdk?.settings || newSdkInfo.settings
        ? {
            ...event.sdk?.settings,
            ...newSdkInfo.settings,
          }
        : undefined,
  };

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

  _enhanceEventWithSdkInfo(event, metadata?.sdk);

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

  const dsn = client?.getDsn();
  const tunnel = client?.getOptions().tunnel;

  const headers: SpanEnvelope[0] = {
    sent_at: new Date().toISOString(),
    ...(dscHasRequiredProps(dsc) && { trace: dsc }),
    ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
  };

  const options = client?.getOptions();
  const ignoreSpans = options?.ignoreSpans;

  const filteredSpans = ignoreSpans?.length
    ? spans.filter(span => !shouldIgnoreSpan(spanToJSON(span), ignoreSpans))
    : spans;
  const droppedSpans = spans.length - filteredSpans.length;

  if (droppedSpans) {
    client?.recordDroppedEvent('before_send', 'span', droppedSpans);
  }

  // checking against traceLifeCycle so that TS can infer the correct type for
  // beforeSendSpan. This is a workaround for now as most likely, this entire function
  // will be removed in the future (once we send standalone spans as spans v2)
  const convertToSpanJSON = options?.beforeSendSpan
    ? (span: SentrySpan) => {
        const spanJson = spanToJSON(span);
        const processedSpan =
          !isV2BeforeSendSpanCallback(options?.beforeSendSpan) && options?.beforeSendSpan?.(spanJson);

        if (!processedSpan) {
          showSpanDropWarning();
          return spanJson;
        }

        return processedSpan;
      }
    : spanToJSON;

  const items: SpanItem[] = [];
  for (const span of filteredSpans) {
    const spanJson = convertToSpanJSON(span);
    if (spanJson) {
      items.push(createSpanEnvelopeItem(spanJson));
    }
  }

  return createEnvelope<SpanEnvelope>(headers, items);
}

/**
 * Create an Envelope from a CSP report.
 */
export function createRawSecurityEnvelope(
  report: LegacyCSPReport,
  dsn: DsnComponents,
  tunnel?: string,
  release?: string,
  environment?: string,
): RawSecurityEnvelope {
  const envelopeHeaders = {
    event_id: uuid4(),
    ...(!!tunnel && dsn && { dsn: dsnToString(dsn) }),
  };

  const eventItem: RawSecurityItem = [
    { type: 'raw_security', sentry_release: release, sentry_environment: environment },
    report,
  ];

  return createEnvelope<RawSecurityEnvelope>(envelopeHeaders, [eventItem]);
}
