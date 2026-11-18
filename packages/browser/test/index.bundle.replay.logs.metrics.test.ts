import { logger as coreLogger, metrics as coreMetrics } from '@sentry/core';
import {
  browserTracingCoreIntegrationShim,
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  fetchTracingIntegrationShim,
  linkedTracesIntegrationShim,
  longTasksIntegrationShim,
  resourcesIntegrationShim,
  spanStreamingIntegrationShim,
  xhrTracingIntegrationShim,
} from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { replayIntegration } from '../src';
import * as ReplayLogsMetricsBundle from '../src/index.bundle.replay.logs.metrics';

describe('index.bundle.replay.logs.metrics', () => {
  it('has correct exports', () => {
    expect(ReplayLogsMetricsBundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegrationShim);
    expect(ReplayLogsMetricsBundle.longTasksIntegration).toBe(longTasksIntegrationShim);
    expect(ReplayLogsMetricsBundle.resourcesIntegration).toBe(resourcesIntegrationShim);
    expect(ReplayLogsMetricsBundle.fetchTracingIntegration).toBe(fetchTracingIntegrationShim);
    expect(ReplayLogsMetricsBundle.xhrTracingIntegration).toBe(xhrTracingIntegrationShim);
    expect(ReplayLogsMetricsBundle.linkedTracesIntegration).toBe(linkedTracesIntegrationShim);

    expect(ReplayLogsMetricsBundle.browserTracingIntegration).toBe(browserTracingIntegrationShim);
    expect(ReplayLogsMetricsBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(ReplayLogsMetricsBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(ReplayLogsMetricsBundle.replayIntegration).toBe(replayIntegration);
    expect(ReplayLogsMetricsBundle.spanStreamingIntegration).toBe(spanStreamingIntegrationShim);

    expect(ReplayLogsMetricsBundle.logger).toBe(coreLogger);
    expect(ReplayLogsMetricsBundle.metrics).toBe(coreMetrics);
  });
});
