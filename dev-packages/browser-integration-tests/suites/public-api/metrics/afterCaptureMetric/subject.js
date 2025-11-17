// Store captured metrics from the afterCaptureMetric event
window.capturedMetrics = [];

const client = Sentry.getClient();

client.on('afterCaptureMetric', metric => {
  window.capturedMetrics.push(metric);
});

Sentry.metrics.count('test.counter', 1, { attributes: { endpoint: '/api/test' } });
Sentry.metrics.gauge('test.gauge', 42, { unit: 'millisecond', attributes: { server: 'test-1' } });
Sentry.setUser({ id: 'user-123', email: 'test@example.com', username: 'testuser' });
Sentry.metrics.distribution('test.distribution', 200, { unit: 'second', attributes: { priority: 'high' } });

Sentry.flush();
