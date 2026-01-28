import { logger as coreLogger, metrics as coreMetrics } from '@sentry/core';
import { browserTracingIntegrationShim, feedbackIntegrationShim } from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { replayIntegration } from '../src';
import * as ReplayLogsMetricsBundle from '../src/index.bundle.replay.logs.metrics';

describe('index.bundle.replay.logs.metrics', () => {
  it('has correct exports', () => {
    expect(ReplayLogsMetricsBundle.browserTracingIntegration).toBe(browserTracingIntegrationShim);
    expect(ReplayLogsMetricsBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(ReplayLogsMetricsBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(ReplayLogsMetricsBundle.replayIntegration).toBe(replayIntegration);

    expect(ReplayLogsMetricsBundle.logger).toBe(coreLogger);
    expect(ReplayLogsMetricsBundle.metrics).toBe(coreMetrics);
  });
});
