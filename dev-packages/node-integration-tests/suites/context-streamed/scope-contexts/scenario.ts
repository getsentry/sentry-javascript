import * as Sentry from '@sentry/node';
import { loggingTransport } from '@sentry-internal/node-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1.0,
  traceLifecycle: 'stream',
  transport: loggingTransport,
});

Sentry.withIsolationScope(isolationScope => {
  isolationScope.setContext('response', { status_code: 200 });
  isolationScope.setContext('cloud_resource', { 'cloud.provider': 'aws', 'cloud.region': 'us-east-1' });
  isolationScope.setContext('profile', { profile_id: 'abc123' });
  isolationScope.setContext('react', { version: '18.2.0' });

  Sentry.startSpan({ name: 'test-span' }, () => {
    // noop
  });
});

void Sentry.flush();
