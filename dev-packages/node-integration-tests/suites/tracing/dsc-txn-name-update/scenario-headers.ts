import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

import * as http from 'http';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Sentry.startSpan(
  { name: 'initial-name', attributes: { [Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url' } },
  async span => {
    await makeHttpRequest(`${process.env.SERVER_URL}/api/v0`);

    span.updateName('updated-name-1');
    span.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'route');

    await makeHttpRequest(`${process.env.SERVER_URL}/api/v1`);

    span.updateName('updated-name-2');
    span.setAttribute(Sentry.SEMANTIC_ATTRIBUTE_SENTRY_SOURCE, 'custom');
    await makeHttpRequest(`${process.env.SERVER_URL}/api/v2`);

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
