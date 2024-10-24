import { loggingTransport } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracePropagationTargets: [/\/v0/, 'v1'],
  integrations: [],
  transport: loggingTransport,
  // Ensure this gets a correct hint
  beforeBreadcrumb(breadcrumb, hint) {
    breadcrumb.data = breadcrumb.data || {};
    const req = hint?.request as { path?: string };
    breadcrumb.data.ADDED_PATH = req?.path;
    return breadcrumb;
  },
});

import * as http from 'http';

async function run(): Promise<void> {
  Sentry.addBreadcrumb({ message: 'manual breadcrumb' });

  await makeHttpRequest(`${process.env.SERVER_URL}/api/v0`);
  await makeHttpGet(`${process.env.SERVER_URL}/api/v1`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v2`);
  await makeHttpRequest(`${process.env.SERVER_URL}/api/v3`);

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

function makeHttpGet(url: string): Promise<void> {
  return new Promise<void>(resolve => {
    http.get(url, httpRes => {
      httpRes.on('data', () => {
        // we don't care about data
      });
      httpRes.on('end', () => {
        resolve();
      });
    });
  });
}
