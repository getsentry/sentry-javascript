import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

function createResource() {
  return {
    [Symbol.dispose]() {
      throw new Error('error from dispose');
    },
  };
}

function run(): void {
  using _resource = createResource();
  throw new Error('original error');
}

try {
  run();
} catch (error) {
  Sentry.captureException(error);
}
