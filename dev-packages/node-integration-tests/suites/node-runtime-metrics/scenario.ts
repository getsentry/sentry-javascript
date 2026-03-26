import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  transport: loggingTransport,
  integrations: [
    Sentry.nodeRuntimeMetricsIntegration({
      collectionIntervalMs: 100,
    }),
  ],
});

async function run(): Promise<void> {
  // Wait long enough for the collection interval to fire at least once.
  await new Promise<void>(resolve => setTimeout(resolve, 250));
  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
