import { Event } from '@sentry/types';

import { API } from './api';

/** A generic client request. */
interface SentryRequest {
  url: string;
  headers: { [key: string]: string };
  body: string;
}

/** Creates a SentryRequest from an event. */
export function eventToSentryRequest(event: Event, api: API, extraHeaders?: { [key: string]: string }): SentryRequest {
  const useEnvelope = event.type === 'transaction';

  const req: SentryRequest = {
    body: JSON.stringify(event),
    headers: {
      // To simplify maintenance, eventToSentryRequest is used by both
      // @sentry/browser and @sentry/node.
      //
      // In @sentry/browser we want to avoid CORS preflight requests and thus we
      // want to ensure outgoing requests are "simple requests" as explained in
      // https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS#Simple_requests.
      //
      // Therefore, we do not include any custom headers (auth goes in the query
      // string instead) and we are limited in the values of Content-Type. If we
      // were to not set the Content-Type header, browsers fill it in as
      // `text/plain`, which is rejected by Relay for envelopes. If we set it to
      // the empty string, current versions of mainstream browsers seem to
      // respect it and despite empty string not being in the list of accepted
      // values for "simple requests", empirically browsers do not send
      // preflight requests in that case.
      //
      // 'Content-Type': useEnvelope ? 'application/x-sentry-envelope' : 'application/json',
      'Content-Type': '',
      ...extraHeaders,
    },
    url: useEnvelope ? api.getEnvelopeEndpointWithUrlEncodedAuth() : api.getStoreEndpointWithUrlEncodedAuth(),
  };

  // https://docs.sentry.io/development/sdk-dev/envelopes/

  // Since we don't need to manipulate envelopes nor store them, there is no
  // exported concept of an Envelope with operations including serialization and
  // deserialization. Instead, we only implement a minimal subset of the spec to
  // serialize events inline here.
  if (useEnvelope) {
    const envelopeHeaders = JSON.stringify({
      event_id: event.event_id,
      sent_at: new Date().toISOString(),
    });
    const itemHeaders = JSON.stringify({
      type: event.type,
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
