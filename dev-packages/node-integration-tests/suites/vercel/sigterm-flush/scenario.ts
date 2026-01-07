import type { BaseTransportOptions, Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import * as Sentry from '@sentry/node';

function bufferedLoggingTransport(_options: BaseTransportOptions): Transport {
  const bufferedEnvelopes: Envelope[] = [];

  return {
    send(envelope: Envelope): Promise<TransportMakeRequestResponse> {
      bufferedEnvelopes.push(envelope);
      return Promise.resolve({ statusCode: 200 });
    },
    flush(_timeout?: number): PromiseLike<boolean> {
      // Print envelopes once flushed to verify they were sent.
      for (const envelope of bufferedEnvelopes.splice(0, bufferedEnvelopes.length)) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(envelope));
      }

      return Promise.resolve(true);
    },
  };
}

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  transport: bufferedLoggingTransport,
});

Sentry.captureMessage('SIGTERM flush message');

// Signal that we're ready to receive SIGTERM.
// eslint-disable-next-line no-console
console.log('READY');

// Keep the process alive so the integration test can send SIGTERM.
setInterval(() => undefined, 1_000);
