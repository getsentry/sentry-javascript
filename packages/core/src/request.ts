import { Event } from '@sentry/types';
import { timestampWithMs } from '@sentry/utils';

import { API } from './api';

/** A generic client request. */
interface SentryRequest {
  body: string;
  url: string;
  // headers would contain auth & content-type headers for @sentry/node, but
  // since @sentry/browser avoids custom headers to prevent CORS preflight
  // requests, we can use the same approach for @sentry/browser and @sentry/node
  // for simplicity -- no headers involved.
  // headers: { [key: string]: string };
}

/** Creates a SentryRequest from an event. */
export function eventToSentryRequest(event: Event, api: API): SentryRequest {
  const useEnvelope = event.type === 'transaction';

  const req: SentryRequest = {
    body: JSON.stringify(event),
    url: useEnvelope ? api.getEnvelopeEndpointWithUrlEncodedAuth() : api.getStoreEndpointWithUrlEncodedAuth(),
  };

  // https://develop.sentry.dev/sdk/envelopes/

  // Since we don't need to manipulate envelopes nor store them, there is no
  // exported concept of an Envelope with operations including serialization and
  // deserialization. Instead, we only implement a minimal subset of the spec to
  // serialize events inline here.
  if (useEnvelope) {
    const envelopeHeaders = JSON.stringify({
      event_id: event.event_id,
      // We need to add * 1000 since we divide it by 1000 by default but JS works with ms precision
      // The reason we use timestampWithMs here is that all clocks across the SDK use the same clock
      sent_at: new Date(timestampWithMs() * 1000).toISOString(),
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
