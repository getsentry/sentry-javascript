import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

// Simulate a user who independently sets up OTel HttpInstrumentation
// alongside the Sentry SDK, as when adopting Sentry into existing OTel app
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

registerInstrumentations({
  instrumentations: [new HttpInstrumentation()],
});

import * as http from 'http';

void Sentry.startSpan({ name: 'test_transaction' }, async () => {
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v0`);
});

function makeHttpRequest(url: string): Promise<void> {
  return new Promise<void>(resolve => {
    http
      .request(url, httpRes => {
        httpRes.on('data', () => {});
        httpRes.on('end', resolve);
      })
      .end();
  });
}
