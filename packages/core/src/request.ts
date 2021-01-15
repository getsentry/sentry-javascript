import { Event, SdkInfo, SentryRequest, Session } from '@sentry/types';
import { isString } from '@sentry/utils';

import { API } from './api';

/** Extract envelope header containing sdk metadata from the API object */
function getSdkMetadataForEnvelopeHeader(api: API): Partial<SdkInfo> | undefined {
  if (!api.metadata) {
    return;
  }

  const { name, version } = api.metadata;
  if (!isString(name) || !isString(version)) {
    return;
  }

  return {
    ...(isString(name) && { name }),
    ...(isString(version) && { version }),
  };
}

/** Creates a SentryRequest from an event. */
export function sessionToSentryRequest(session: Session, api: API): SentryRequest {
  const sdkMetadata = getSdkMetadataForEnvelopeHeader(api);
  const envelopeHeaders = JSON.stringify({
    sent_at: new Date().toISOString(),
    ...(sdkMetadata && {
      sdk: sdkMetadata,
    }),
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

/** Creates a SentryRequest from an event. */
export function eventToSentryRequest(event: Event, api: API): SentryRequest {
  // since JS has no Object.prototype.pop()
  const { __sentry_samplingMethod: samplingMethod, __sentry_sampleRate: sampleRate, ...otherTags } = event.tags || {};
  event.tags = otherTags;

  const useEnvelope = event.type === 'transaction';

  const req: SentryRequest = {
    body: JSON.stringify(event),
    type: event.type || 'event',
    url: useEnvelope ? api.getEnvelopeEndpointWithUrlEncodedAuth() : api.getStoreEndpointWithUrlEncodedAuth(),
  };

  // https://develop.sentry.dev/sdk/envelopes/

  // Since we don't need to manipulate envelopes nor store them, there is no
  // exported concept of an Envelope with operations including serialization and
  // deserialization. Instead, we only implement a minimal subset of the spec to
  // serialize events inline here.
  if (useEnvelope) {
    const sdkMetadata = getSdkMetadataForEnvelopeHeader(api);
    const envelopeHeaders = JSON.stringify({
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
      ...(sdkMetadata && {
        sdk: sdkMetadata,
      }),
    });
    const itemHeaders = JSON.stringify({
      type: event.type,

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
