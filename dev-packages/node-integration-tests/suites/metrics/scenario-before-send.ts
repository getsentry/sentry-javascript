import * as Sentry from '@sentry/node';
import { _INTERNAL_flushMetricsBuffer } from '@sentry/core';
import type { Metric } from '@sentry/types';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  _enableTraceMetrics: true,
  beforeSend: () => null,
  beforeSendMetric: (metric: Metric) => {
    // Filter out specific metrics
    if (metric.name === 'filtered.metric') {
      return null;
    }
    
    // Modify metric value
    if (metric.name === 'modified.metric') {
      return {
        ...metric,
        value: 200, // Change value from 100 to 200
      };
    }
    
    return metric;
  },
});

// This metric should be filtered out
Sentry.metrics.count('filtered.metric', 1, {
  should: 'be-filtered',
});

// This metric should be modified
Sentry.metrics.gauge('modified.metric', 100, undefined, {
  should: 'be-modified',
});

// This metric should pass through unchanged
Sentry.metrics.count('normal.metric', 1, {
  should: 'pass-through',
});

// Flush metrics buffer
const client = Sentry.getClient();
if (client) {
  _INTERNAL_flushMetricsBuffer(client);
}

setTimeout(() => {
  process.exit(0);
}, 500);
