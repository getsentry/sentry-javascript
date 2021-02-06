import { Event, SdkInfo, SentryRequest, Session } from '@sentry/types';

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

  event.sdk = event.sdk || {
    name: sdkInfo.name,
    version: sdkInfo.version,
  };
  event.sdk.name = event.sdk.name || sdkInfo.name;
  event.sdk.version = event.sdk.version || sdkInfo.version;
  event.sdk.integrations = [...(event.sdk.integrations || []), ...(sdkInfo.integrations || [])];
  event.sdk.packages = [...(event.sdk.packages || []), ...(sdkInfo.packages || [])];
  return event;
}

/**
 * Create a SentryRequest from an error, message, or transaction event.
 *
 * @param event The event to send
 * @param api Helper to provide the correct url for the request
 * @returns SentryRequest representing the event
 */
export function eventToSentryRequest(event: Event, api: API): SentryRequest {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(api);
  const eventWithSdkInfo = sdkInfo ? enhanceEventWithSdkInfo(event, api.metadata.sdk) : event;

  if (event.type === 'transaction') {
    return transactionToSentryRequest(eventWithSdkInfo, api);
  }
  return {
    body: JSON.stringify(eventWithSdkInfo),
    type: event.type || 'event',
    url: api.getStoreEndpointWithUrlEncodedAuth(),
  };
}

/**
 * Create a SentryRequest from a transaction event.
 *
 * Since we don't need to manipulate envelopes nor store them, there is no exported concept of an Envelope with
 * operations including serialization and deserialization. Instead, we only implement a minimal subset of the spec to
 * serialize events inline here. See https://develop.sentry.dev/sdk/envelopes/.
 *
 * @param event The transaction event to send
 * @param api Helper to provide the correct url for the request
 * @returns SentryRequest in envelope form
 */
export function transactionToSentryRequest(event: Event, api: API): SentryRequest {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(api);

  const { transactionSampling, ...metadata } = event.debug_meta || {};
  const { method: samplingMethod, rate: sampleRate } = transactionSampling || {};
  if (Object.keys(metadata).length === 0) {
    delete event.debug_meta;
  } else {
    event.debug_meta = metadata;
  }

  const envelopeHeaders = JSON.stringify({
    event_id: event.event_id,
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),

    // trace context for dynamic sampling on relay
    trace: {
      trace_id: event.contexts?.trace?.trace_id,
      public_key: api.getDsn().publicKey,
      environment: event.environment || null,
      release: event.release || null,
    },
  });

  const itemHeaders = JSON.stringify({
    type: event.type,

    // TODO: Right now, sampleRate will be undefined in the cases of inheritance and explicitly-set sampling decisions.
    sample_rates: [{ id: samplingMethod, rate: sampleRate }],

    // Note: `content_type` and `length` were left out on purpose. Here's a quick explanation of why, along with the
    // value to use if we ever decide to put them back in.
    //
    // `content_type`:
    // Assumed to be 'application/json' and not part of the current spec for transaction items. No point in bloating the
    // request body with it.
    //
    // would be:
    // content_type: 'application/json',
    //
    // `length`:
    // Optional and equal to the number of bytes in req.Body encoded as UTF-8. Since the server can figure this out and
    // would otherwise refuse events that report the length incorrectly, we decided not to send the length to avoid
    // problems related to reporting the wrong size and to reduce request body size.
    //
    // would be:
    // length: new TextEncoder().encode(req.body).length,
  });

  const req: SentryRequest = {
    // The trailing newline is optional; leave it off to avoid sending unnecessary bytes.
    // body: `${envelopeHeaders}\n${itemHeaders}\n${JSON.stringify(event)\n}`,
    body: `${envelopeHeaders}\n${itemHeaders}\n${JSON.stringify(event)}`,
    type: 'transaction',
    url: api.getEnvelopeEndpointWithUrlEncodedAuth(),
  };

  return req;
}

/**
 * Create a SentryRequest from a session event.
 *
 * @param event The session event to send
 * @param api Helper to provide the correct url for the request
 * @returns SentryRequest in envelope form
 */
export function sessionToSentryRequest(session: Session, api: API): SentryRequest {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(api);
  const envelopeHeaders = JSON.stringify({
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
  });
  const itemHeaders = JSON.stringify({
    type: 'session',
  });

  return {
    body: `${envelopeHeaders}\n${itemHeaders}\n${JSON.stringify(session)}`,
    type: 'session',
    url: api.getEnvelopeEndpointWithUrlEncodedAuth(),
  };
}
