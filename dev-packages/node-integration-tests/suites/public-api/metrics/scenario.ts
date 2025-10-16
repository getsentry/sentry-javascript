import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0.0',
  environment: 'test',
  _experiments: {
    enableMetrics: true,
  },
  transport: loggingTransport,
});

async function run(): Promise<void> {
  Sentry.metrics.count('test.counter', 1, { attributes: { endpoint: '/api/test' } });

  Sentry.metrics.gauge('test.gauge', 42, { unit: 'millisecond', attributes: { server: 'test-1' } });

  Sentry.metrics.distribution('test.distribution', 200, { unit: 'second', attributes: { priority: 'high' } });

  await Sentry.startSpan({ name: 'test-span', op: 'test' }, async () => {
    Sentry.metrics.count('test.span.counter', 1, { attributes: { operation: 'test' } });
  });

  Sentry.setUser({ id: 'user-123', email: 'test@example.com', username: 'testuser' });
  Sentry.metrics.count('test.user.counter', 1, { attributes: { action: 'click' } });

  await Sentry.flush();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
