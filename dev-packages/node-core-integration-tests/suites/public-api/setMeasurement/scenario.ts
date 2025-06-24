import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-integration-tests';
import { setupOtel } from '../../../utils/setupOtel';

const client = Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1,
  transport: loggingTransport,
});

setupOtel(client);

async function run(): Promise<void> {
  Sentry.startSpan({ name: 'some_transaction' }, () => {
    Sentry.setMeasurement('metric.foo', 42, 'ms');
    Sentry.setMeasurement('metric.bar', 1337, 'nanoseconds');
    Sentry.setMeasurement('metric.baz', 99, 's');
    Sentry.setMeasurement('metric.baz', 1, '');
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
void run();
