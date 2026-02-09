import { logger as coreLogger, metrics as coreMetrics } from '@sentry/core';
import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { browserTracingIntegration, replayIntegration } from '../src';
import * as TracingReplayLogsMetricsBundle from '../src/index.bundle.tracing.replay.logs.metrics';

describe('index.bundle.tracing.replay.logs.metrics', () => {
  it('has correct exports', () => {
    expect(TracingReplayLogsMetricsBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingReplayLogsMetricsBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(TracingReplayLogsMetricsBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(TracingReplayLogsMetricsBundle.replayIntegration).toBe(replayIntegration);

    expect(TracingReplayLogsMetricsBundle.logger).toBe(coreLogger);
    expect(TracingReplayLogsMetricsBundle.metrics).toBe(coreMetrics);
  });
});
