import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  traceLifecycle: 'static',
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  // The casing here intentionally disagrees with the casing of the requested URLs below.
  tracePropagationTargets: [/\/API\/Regex/, 'api/String'],
  integrations: [],
  transport: loggingTransport,
});

import * as http from 'http';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan({ name: 'test_span' }, async () => {
  await makeHttpRequest(`${process.env.SERVER_URL}/api/regex`);
  await makeHttpRequest(`${process.env.SERVER_URL}/API/STRING`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/no-match`);
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
