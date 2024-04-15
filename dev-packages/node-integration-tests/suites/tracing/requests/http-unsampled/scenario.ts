import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracePropagationTargets: [/\/v0/, 'v1'],
  tracesSampleRate: 0,
  integrations: [],
  transport: loggingTransport,
});

import * as http from 'http';

async function run(): Promise<void> {
  // Wrap in span that is not sampled
  await Sentry.startSpan({ name: 'outer' }, async () => {
    await makeHttpRequest(`${process.env.SERVER_URL}/api/v0`);
    await makeHttpRequest(`${process.env.SERVER_URL}/api/v1`);
    await makeHttpRequest(`${process.env.SERVER_URL}/api/v2`);
    await makeHttpRequest(`${process.env.SERVER_URL}/api/v3`);
  });

  Sentry.captureException(new Error('foo'));
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();

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
