import { logger as coreLogger, metrics as coreMetrics } from '@sentry/core';
import { feedbackIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { browserTracingIntegration } from '../src';
import * as TracingLogsMetricsBundle from '../src/index.bundle.tracing.logs.metrics';

describe('index.bundle.tracing.logs.metrics', () => {
  it('has correct exports', () => {
    expect(TracingLogsMetricsBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingLogsMetricsBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(TracingLogsMetricsBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(TracingLogsMetricsBundle.replayIntegration).toBe(replayIntegrationShim);

    expect(TracingLogsMetricsBundle.logger).toBe(coreLogger);
    expect(TracingLogsMetricsBundle.metrics).toBe(coreMetrics);
  });
});
