// Store captured metrics from the afterCaptureMetric event
window.capturedMetrics = [];

const client = Sentry.getClient();

client.on('afterCaptureMetric', metric => {
  window.capturedMetrics.push(metric);
});

// Capture metrics - these should be processed by beforeSendMetric
Sentry.metrics.count('test.counter', 1, { attributes: { endpoint: '/api/test', original: 'value' } });
Sentry.metrics.gauge('test.gauge', 42, { unit: 'millisecond', attributes: { server: 'test-1' } });

Sentry.flush();
