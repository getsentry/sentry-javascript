import { Event, SdkInfo, SentryRequest, SentryRequestType, Session, SessionAggregates } from '@sentry/types';
import { base64ToUnicode, logger } from '@sentry/utils';

import { API } from './api';

/** Extract sdk info from from the API metadata */
function getSdkMetadataForEnvelopeHeader(api: API): SdkInfo | undefined {
  if (!api.metadata || !api.metadata.sdk) {
    return;
  }
  const { name, version } = api.metadata.sdk;
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

/** Creates a SentryRequest from a Session. */
export function sessionToSentryRequest(session: Session | SessionAggregates, api: API): SentryRequest {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(api);
  const envelopeHeaders = JSON.stringify({
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(api.forceEnvelope() && { dsn: api.getDsn().toString() }),
  });
  // I know this is hacky but we don't want to add `session` to request type since it's never rate limited
  const type: SentryRequestType = 'aggregates' in session ? ('sessions' as SentryRequestType) : 'session';
  const itemHeaders = JSON.stringify({
    type,
  });

  return {
    body: `${envelopeHeaders}\n${itemHeaders}\n${JSON.stringify(session)}`,
    type,
    url: api.getEnvelopeEndpointWithUrlEncodedAuth(),
  };
}

/** Creates a SentryRequest from an event. */
export function eventToSentryRequest(event: Event, api: API): SentryRequest {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(api);
  const eventType = event.type || 'event';
  const useEnvelope = eventType === 'transaction' || api.forceEnvelope();

  const req: SentryRequest = {
    body: JSON.stringify(sdkInfo ? enhanceEventWithSdkInfo(event, api.metadata.sdk) : event),
    type: eventType,
    url: useEnvelope ? api.getEnvelopeEndpointWithUrlEncodedAuth() : api.getStoreEndpointWithUrlEncodedAuth(),
  };

  // https://develop.sentry.dev/sdk/envelopes/

  // Since we don't need to manipulate envelopes nor store them, there is no
  // exported concept of an Envelope with operations including serialization and
  // deserialization. Instead, we only implement a minimal subset of the spec to
  // serialize events inline here.
  if (useEnvelope) {
    // Extract header information from event
    const { transactionSampling, tracestate, ...metadata } = event.debug_meta || {};
    if (Object.keys(metadata).length === 0) {
      delete event.debug_meta;
    } else {
      event.debug_meta = metadata;
    }

    // the tracestate is stored in bas64-encoded JSON, but envelope header values are expected to be full JS values,
    // so we have to decode and reinflate it
    let reinflatedTracestate;
    try {
      // Because transaction metadata passes through a number of locations (transactionContext, transaction, event during
      // processing, event as sent), each with different requirements, all of the parts are typed as optional. That said,
      // if we get to this point and either `tracestate` or `tracestate.sentry` are undefined, something's gone very wrong.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const encodedSentryValue = tracestate!.sentry!.replace('sentry=', '');
      reinflatedTracestate = JSON.parse(base64ToUnicode(encodedSentryValue));
    } catch (err) {
      logger.warn(err);
    }

    const envelopeHeaders = JSON.stringify({
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
      ...(sdkInfo && { sdk: sdkInfo }),
      ...(api.forceEnvelope() && { dsn: api.getDsn().toString() }),
      ...(reinflatedTracestate && { trace: reinflatedTracestate }), // trace context for dynamic sampling on relay
    });

    const itemHeaderEntries: { [key: string]: unknown } = {
      type: eventType,

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
    };

    if (eventType === 'transaction') {
      // TODO: Right now, `sampleRate` will be undefined in the cases of inheritance and explicitly-set sampling decisions.
      itemHeaderEntries.sample_rates = [{ id: transactionSampling?.method, rate: transactionSampling?.rate }];
    }

    const itemHeaders = JSON.stringify(itemHeaderEntries);

    // The trailing newline is optional. We intentionally don't send it to avoid
    // sending unnecessary bytes.
    //
    // const envelope = `${envelopeHeaders}\n${itemHeaders}\n${req.body}\n`;
    const envelope = `${envelopeHeaders}\n${itemHeaders}\n${req.body}`;
    req.body = envelope;
  }

  return req;
}
