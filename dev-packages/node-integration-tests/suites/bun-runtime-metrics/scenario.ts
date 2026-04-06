import * as Sentry from '@sentry/node';
import { bunRuntimeMetricsIntegration } from '@sentry/bun';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  transport: loggingTransport,
  integrations: [
    bunRuntimeMetricsIntegration({
      collectionIntervalMs: 1000,
    }),
  ],
});

async function run(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 1100));
  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
