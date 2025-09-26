import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  _enableTraceMetrics: false, // Metrics disabled
  beforeSend: () => null,
});

// These metrics should not be captured
Sentry.metrics.count('api.requests', 1, {
  endpoint: '/api/users',
  method: 'GET',
  status: 200,
});

Sentry.metrics.gauge('memory.usage', 1024, 'megabyte', {
  process: 'web-server',
  region: 'us-east-1',
});

setTimeout(() => {
  process.exit(0);
}, 500);
