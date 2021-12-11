import { Event, SdkInfo, SentryRequest, SentryRequestType, Session, SessionAggregates } from '@sentry/types';

import { API } from './api';

/**
 * Apply SdkInfo (name, version, packages, integrations) to the corresponding event key.
 * Merge with existing data if any.
 **/
function enhanceEventWithSdkInfo(event: Event, { name, version, integrations = [], packages = [] }: SdkInfo): Event {
  event.sdk = event.sdk || {};
  event.sdk.name = event.sdk.name || name;
  event.sdk.version = event.sdk.version || version;
  event.sdk.integrations = [...(event.sdk.integrations || []), ...integrations];
  event.sdk.packages = [...(event.sdk.packages || []), ...packages];
  return event;
}

/** Creates a SentryRequest from a Session. */
export function sessionToSentryRequest(session: Session | SessionAggregates, api: API): SentryRequest {
  const sdkInfo = api.metadata && api.metadata.sdk;
  const envelopeHeaders = generateEnvelopeHeaders(api, sdkInfo);
  // I know this is hacky but we don't want to add `session` to request type since it's never rate limited
  const type: SentryRequestType = 'aggregates' in session ? ('sessions' as SentryRequestType) : 'session';
  const itemHeaders = JSON.stringify({
    type,
  });

  return {
    body: `${JSON.stringify(envelopeHeaders)}\n${itemHeaders}\n${JSON.stringify(session)}`,
    type,
    url: api.getEnvelopeEndpointWithUrlEncodedAuth(),
  };
}

/** Creates a SentryRequest from an event. */
export function eventToSentryRequest(event: Event, api: API): SentryRequest {
  const sdkInfo = api.metadata && api.metadata.sdk;
  const eventType = event.type || 'event';
  const useEnvelope = eventType === 'transaction' || api.forceEnvelope();

  const { transactionSampling, ...metadata } = event.debug_meta || {};
  const { method: samplingMethod, rate: sampleRate } = transactionSampling || {};
  if (Object.keys(metadata).length === 0) {
    delete event.debug_meta;
  } else {
    event.debug_meta = metadata;
  }

  const req: SentryRequest = {
    body: JSON.stringify(sdkInfo ? enhanceEventWithSdkInfo(event, sdkInfo) : event),
    type: eventType,
    url: useEnvelope ? api.getEnvelopeEndpointWithUrlEncodedAuth() : api.getStoreEndpointWithUrlEncodedAuth(),
  };

  // https://develop.sentry.dev/sdk/envelopes/

  // Since we don't need to manipulate envelopes nor store them, there is no
  // exported concept of an Envelope with operations including serialization and
  // deserialization. Instead, we only implement a minimal subset of the spec to
  // serialize events inline here.
  if (useEnvelope) {
    const envelopeHeaders = generateEnvelopeHeaders(api, sdkInfo, event.event_id);
    const itemHeaders = JSON.stringify({
      type: eventType,

      // TODO: Right now, sampleRate may or may not be defined (it won't be in the cases of inheritance and
      // explicitly-set sampling decisions). Are we good with that?
      sample_rates: [{ id: samplingMethod, rate: sampleRate }],

      // The content-type is assumed to be 'application/json' and not part of
      // the current spec for transaction items, so we don't bloat the request
      // body with it.
      //
      // content_type: 'application/json',
      //
      // The length is optional. It must be the number of bytes in req.Body
      // encoded as UTF-8. Since the server can figure this out and would
      // otherwise refuse events that report the length incorrectly, we decided
      // not to send the length to avoid problems related to reporting the wrong
      // size and to reduce request body size.
      //
      // length: new TextEncoder().encode(req.body).length,
    });
    // The trailing newline is optional. We intentionally don't send it to avoid
    // sending unnecessary bytes.
    //
    // const envelope = `${envelopeHeaders}\n${itemHeaders}\n${req.body}\n`;
    const envelope = `${envelopeHeaders}\n${itemHeaders}\n${req.body}`;
    req.body = envelope;
  }

  return req;
}

function generateEnvelopeHeaders(api: API, sdkInfo: SdkInfo | undefined, event_id?: Event['event_id']): string {
  return JSON.stringify({
    event_id,
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(api.forceEnvelope() && { dsn: api.getDsn().toString() }),
  });
}
