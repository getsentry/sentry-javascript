import * as Sentry from '@sentry/node-core';
import { loggingTransport } from '@sentry-internal/node-core-otel-v2-integration-tests';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  transport: loggingTransport,
});

Sentry.addBreadcrumb({
  category: 'foo',
  message: 'bar',
  level: 'fatal',
});

Sentry.addBreadcrumb({
  category: 'qux',
});

Sentry.captureMessage('test_multi_breadcrumbs');
