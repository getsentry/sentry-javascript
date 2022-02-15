import { Event, SdkInfo, SentryRequest, SentryRequestType, Session, SessionAggregates } from '@sentry/types';
import { dsnToString, normalize } from '@sentry/utils';

import { APIDetails, getEnvelopeEndpointWithUrlEncodedAuth, getStoreEndpointWithUrlEncodedAuth } from './api';

/** Extract sdk info from from the API metadata */
function getSdkMetadataForEnvelopeHeader(api: APIDetails): SdkInfo | undefined {
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
export function sessionToSentryRequest(session: Session | SessionAggregates, api: APIDetails): SentryRequest {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(api);
  const envelopeHeaders = JSON.stringify({
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(!!api.tunnel && { dsn: dsnToString(api.dsn) }),
  });
  // I know this is hacky but we don't want to add `session` to request type since it's never rate limited
  const type: SentryRequestType = 'aggregates' in session ? ('sessions' as SentryRequestType) : 'session';
  const itemHeaders = JSON.stringify({
    type,
  });

  return {
    body: `${envelopeHeaders}\n${itemHeaders}\n${JSON.stringify(session)}`,
    type,
    url: getEnvelopeEndpointWithUrlEncodedAuth(api.dsn, api.tunnel),
  };
}

/** Creates a SentryRequest from an event. */
export function eventToSentryRequest(event: Event, api: APIDetails): SentryRequest {
  const sdkInfo = getSdkMetadataForEnvelopeHeader(api);
  const eventType = event.type || 'event';
  const useEnvelope = eventType === 'transaction' || !!api.tunnel;

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
  enhanceEventWithSdkInfo(event, api.metadata.sdk);
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

  let body;
  try {
    // 99.9% of events should get through just fine - no change in behavior for them
    body = JSON.stringify(event);
  } catch (err) {
    // Record data about the error without replacing original event data, then force renormalization
    event.tags.JSONStringifyError = true;
    event.extra.JSONStringifyError = err;
    try {
      body = JSON.stringify(normalize(event));
    } catch (newErr) {
      // At this point even renormalization hasn't worked, meaning something about the event data has gone very wrong.
      // Time to cut our losses and record only the new error. With luck, even in the problematic cases we're trying to
      // debug with this hack, we won't ever land here.
      const innerErr = newErr as Error;
      body = JSON.stringify({
        message: 'JSON.stringify error after renormalization',
        // setting `extra: { innerErr }` here for some reason results in an empty object, so unpack manually
        extra: { message: innerErr.message, stack: innerErr.stack },
      });
    }
  }

  const req: SentryRequest = {
    // this is the relevant line of code before the hack was added, to make it easy to undo said hack once we've solved
    // the mystery
    // body: JSON.stringify(sdkInfo ? enhanceEventWithSdkInfo(event, api.metadata.sdk) : event),
    body,
    type: eventType,
    url: useEnvelope
      ? getEnvelopeEndpointWithUrlEncodedAuth(api.dsn, api.tunnel)
      : getStoreEndpointWithUrlEncodedAuth(api.dsn),
  };

  // https://develop.sentry.dev/sdk/envelopes/

  // Since we don't need to manipulate envelopes nor store them, there is no
  // exported concept of an Envelope with operations including serialization and
  // deserialization. Instead, we only implement a minimal subset of the spec to
  // serialize events inline here.
  if (useEnvelope) {
    const envelopeHeaders = JSON.stringify({
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
      ...(sdkInfo && { sdk: sdkInfo }),
      ...(!!api.tunnel && { dsn: dsnToString(api.dsn) }),
    });
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
