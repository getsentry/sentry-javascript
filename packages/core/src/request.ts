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
 * Add SDK metadata (name, version, packages, integrations) to the event.
 *
 * Mutates the object in place. If prior metadata exists, it will be merged with the given metadata.
 **/
function enhanceEventWithSdkInfo(event: Event, sdkInfo?: SdkInfo): void {
  if (!sdkInfo) {
    return;
  }
  event.sdk = event.sdk || {};
  event.sdk.name = event.sdk.name || sdkInfo.name;
  event.sdk.version = event.sdk.version || sdkInfo.version;
  event.sdk.integrations = [...(event.sdk.integrations || []), ...(sdkInfo.integrations || [])];
  event.sdk.packages = [...(event.sdk.packages || []), ...(sdkInfo.packages || [])];
  return;
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

  enhanceEventWithSdkInfo(event, api.metadata.sdk);

  // Since we don't need to manipulate envelopes nor store them, there is no exported concept of an Envelope with
  // operations including serialization and deserialization. Instead, we only implement a minimal subset of the spec to
  // serialize events inline here. See https://develop.sentry.dev/sdk/envelopes/.
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

      // Note: as mentioned above, `content_type` and `length` were left out on purpose.
      //
      // `content_type`:
      // Assumed to be 'application/json' and not part of the current spec for transaction items. No point in bloating the
      // request body with it. (Would be `content_type: 'application/json'`.)
      //
      // `length`:
      // Optional and equal to the number of bytes in `req.Body` encoded as UTF-8. Since the server can figure this out
      // and will refuse events that report the length incorrectly, we decided not to send the length to reduce request
      // body size and to avoid problems related to reporting the wrong size.(Would be
      // `length: new TextEncoder().encode(req.body).length`.)
    };

    if (eventType === 'transaction') {
      // TODO: Right now, `sampleRate` will be undefined in the cases of inheritance and explicitly-set sampling decisions.
      itemHeaderEntries.sample_rates = [{ id: transactionSampling?.method, rate: transactionSampling?.rate }];
    }

    const itemHeaders = JSON.stringify(itemHeaderEntries);

    const eventJSON = JSON.stringify(event);

    // The trailing newline is optional; leave it off to avoid sending unnecessary bytes. (Would be
    // `const envelope = `${envelopeHeaders}\n${itemHeaders}\n${req.body}\n`;`.)
    const envelope = `${envelopeHeaders}\n${itemHeaders}\n${eventJSON}`;

    return {
      body: envelope,
      type: eventType,
      url: api.getEnvelopeEndpointWithUrlEncodedAuth(),
    };
  }

  return {
    body: JSON.stringify(event),
    type: eventType,
    url: api.getStoreEndpointWithUrlEncodedAuth(),
  };
}
