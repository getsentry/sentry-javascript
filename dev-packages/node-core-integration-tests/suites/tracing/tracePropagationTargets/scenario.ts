import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-integration-tests';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  tracePropagationTargets: [/\/v0/, 'v1'],
  integrations: [],
  transport: loggingTransport,
});

setupOtel(client);

import * as http from 'http';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan({ name: 'test_span' }, async () => {
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v0`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v1`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v2`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v3`);
});

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
