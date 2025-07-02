import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-integration-tests';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
  tracesSampleRate: 1,
  environment: 'production',
  openTelemetryInstrumentations: [new HttpInstrumentation()],
});

setupOtel(client);

import http from 'http';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan(
  {
    name: 'initial-name',
    attributes: { [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' },
  },
  async span => {
    const serverUrl = process.env.SERVER_URL;
    if (!serverUrl) {
      throw new Error('SERVER_URL environment variable not set');
    }

    await makeHttpRequest(`${serverUrl}/api/v0`);

    span.updateName('updated-name-1');
    span.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    await makeHttpRequest(`${serverUrl}/api/v1`);

    span.updateName('updated-name-2');
    span.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'custom');

    await makeHttpRequest(`${serverUrl}/api/v2`);

    span.end();
  },
);

function makeHttpRequest(url: string): Promise<void> {
  return new Promise<void>(resolve => {
    http
      .request(url, httpRes => {
        httpRes.on('data', () => {
          // we don't care about data
        });
        httpRes.on('end', () => {
          resolve();
        });
      })
      .end();
  });
}
