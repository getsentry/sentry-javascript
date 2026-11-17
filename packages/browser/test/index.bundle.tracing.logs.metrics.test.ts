import { logger as coreLogger, metrics as coreMetrics } from '@sentry/core';
import { feedbackIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import {
  browserTracingCoreIntegration,
  browserTracingIntegration,
  fetchTracingIntegration,
  linkedTracesIntegration,
  longTasksIntegration,
  resourcesIntegration,
  spanStreamingIntegration,
  webVitalsIntegration,
  xhrTracingIntegration,
} from '../src';
import * as TracingLogsMetricsBundle from '../src/index.bundle.tracing.logs.metrics';

describe('index.bundle.tracing.logs.metrics', () => {
  it('has correct exports', () => {
    expect(TracingLogsMetricsBundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegration);
    expect(TracingLogsMetricsBundle.longTasksIntegration).toBe(longTasksIntegration);
    expect(TracingLogsMetricsBundle.resourcesIntegration).toBe(resourcesIntegration);
    expect(TracingLogsMetricsBundle.fetchTracingIntegration).toBe(fetchTracingIntegration);
    expect(TracingLogsMetricsBundle.xhrTracingIntegration).toBe(xhrTracingIntegration);
    expect(TracingLogsMetricsBundle.linkedTracesIntegration).toBe(linkedTracesIntegration);

    expect(TracingLogsMetricsBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingLogsMetricsBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(TracingLogsMetricsBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(TracingLogsMetricsBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(TracingLogsMetricsBundle.spanStreamingIntegration).toBe(spanStreamingIntegration);
    expect(TracingLogsMetricsBundle.webVitalsIntegration).toBe(webVitalsIntegration);

    expect(TracingLogsMetricsBundle.logger).toBe(coreLogger);
    expect(TracingLogsMetricsBundle.metrics).toBe(coreMetrics);
  });
});
