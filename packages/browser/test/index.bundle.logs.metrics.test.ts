import { logger as coreLogger, metrics as coreMetrics } from '@sentry/core/browser';
import { spanStreamingIntegrationShim } from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import * as LogsMetricsBundle from '../src/index.bundle.logs.metrics';

describe('index.bundle.logs.metrics', () => {
  it('has correct exports', () => {
    expect(LogsMetricsBundle.logger).toBe(coreLogger);
    expect(LogsMetricsBundle.metrics).toBe(coreMetrics);
    expect(LogsMetricsBundle.spanStreamingIntegration).toBe(spanStreamingIntegrationShim);
  });
});
