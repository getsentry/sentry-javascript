import * as Sentry from '@sentry/node';
import { _INTERNAL_flushMetricsBuffer } from '@sentry/core';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  _enableTraceMetrics: true,
  beforeSend: () => null,
});

// Test counter metric
Sentry.metrics.count('api.requests', 1, {
  endpoint: '/api/users',
  method: 'GET',
  status: 200,
});

// Test counter with custom value
Sentry.metrics.count('items.processed', 5, {
  processor: 'batch-processor',
  queue: 'high-priority',
});

// Test gauge metric with unit
Sentry.metrics.gauge('memory.usage', 1024, 'megabyte', {
  process: 'web-server',
  region: 'us-east-1',
});

// Test gauge without unit
Sentry.metrics.gauge('active.connections', 42, undefined, {
  server: 'api-1',
  protocol: 'websocket',
});

// Test histogram with unit
Sentry.metrics.histogram('response.time', 150, 'millisecond', {
  endpoint: '/api/data',
  method: 'POST',
  status: 201,
});

// Test histogram without unit
Sentry.metrics.histogram('file.size', 2048, undefined, {
  type: 'upload',
  format: 'pdf',
});

// Test distribution with unit
Sentry.metrics.distribution('task.duration', 500, 'millisecond', {
  task: 'data-processing',
  priority: 'high',
});

// Test distribution without unit
Sentry.metrics.distribution('batch.size', 100, undefined, {
  processor: 'batch-1',
  type: 'async',
});

// Test set with string value
Sentry.metrics.set('unique.users', 'user-123', {
  page: '/dashboard',
  action: 'view',
});

// Test set with numeric value
Sentry.metrics.set('unique.error.codes', 404, {
  service: 'api',
  environment: 'production',
});

// Test metrics within a span
Sentry.startSpan({ name: 'test-span', op: 'test' }, () => {
  Sentry.metrics.count('span.metric', 1, {
    operation: 'test',
  });

  Sentry.metrics.gauge('span.gauge', 100, 'percent', {
    component: 'test-component',
  });
});

// Test metrics with user context
Sentry.setUser({ id: 'user-456', email: 'test@example.com', username: 'testuser' });
Sentry.metrics.count('user.action', 1, {
  action: 'login',
});

// Flush metrics buffer
const client = Sentry.getClient();
if (client) {
  _INTERNAL_flushMetricsBuffer(client);
}

setTimeout(() => {
  process.exit(0);
}, 500);
