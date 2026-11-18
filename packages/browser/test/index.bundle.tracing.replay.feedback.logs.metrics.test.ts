import { logger as coreLogger, metrics as coreMetrics } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import {
  browserTracingCoreIntegration,
  browserTracingIntegration,
  feedbackAsyncIntegration,
  fetchTracingIntegration,
  linkedTracesIntegration,
  longTasksIntegration,
  replayIntegration,
  resourcesIntegration,
  spanStreamingIntegration,
  webVitalsIntegration,
  xhrTracingIntegration,
} from '../src';
import * as TracingReplayFeedbackLogsMetricsBundle from '../src/index.bundle.tracing.replay.feedback.logs.metrics';

describe('index.bundle.tracing.replay.feedback.logs.metrics', () => {
  it('has correct exports', () => {
    expect(TracingReplayFeedbackLogsMetricsBundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.longTasksIntegration).toBe(longTasksIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.resourcesIntegration).toBe(resourcesIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.fetchTracingIntegration).toBe(fetchTracingIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.xhrTracingIntegration).toBe(xhrTracingIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.linkedTracesIntegration).toBe(linkedTracesIntegration);

    expect(TracingReplayFeedbackLogsMetricsBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.feedbackAsyncIntegration).toBe(feedbackAsyncIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.feedbackIntegration).toBe(feedbackAsyncIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.replayIntegration).toBe(replayIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.spanStreamingIntegration).toBe(spanStreamingIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.webVitalsIntegration).toBe(webVitalsIntegration);

    expect(TracingReplayFeedbackLogsMetricsBundle.logger).toBe(coreLogger);
    expect(TracingReplayFeedbackLogsMetricsBundle.metrics).toBe(coreMetrics);
  });
});
