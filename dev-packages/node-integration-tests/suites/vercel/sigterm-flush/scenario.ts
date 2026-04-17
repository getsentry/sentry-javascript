import type { BaseTransportOptions, Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import * as Sentry from '@sentry/node';

import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

// if this script is left running from a former invokation of the integration
// suite, then kill the zombie and take over. Only do this if the pidfile is
// from the last hour to avoid pid reuse issues.
const pidfile = tmpdir() + '/sentry-vercel-sigterm-flush-scenario.pid';
try {
  const stat = statSync(pidfile);
  const oldPid = readFileSync(pidfile);
  if (oldPid && stat.mtime.getTime() >= (Date.now() - (1000 * 60 * 60))) {
    process.kill(Number(oldPid), 'SIGKILL');
  }
} catch {}
writeFileSync(pidfile, String(process.pid));
process.on('exit', () => unlinkSync(pidfile));

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
