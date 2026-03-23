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
      collect: {
        cpuTime: true,
        memExternal: true,
        eventLoopDelayMin: true,
        eventLoopDelayMax: true,
        eventLoopDelayMean: true,
        eventLoopDelayP90: true,
      },
    }),
  ],
});

async function run(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 250));
  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
