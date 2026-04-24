import { logger as coreLogger, metrics as coreMetrics } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import {
  browserTracingIntegration,
  feedbackAsyncIntegration,
  replayIntegration,
  spanStreamingIntegration,
} from '../src';
import * as TracingReplayFeedbackLogsMetricsBundle from '../src/index.bundle.tracing.replay.feedback.logs.metrics';

describe('index.bundle.tracing.replay.feedback.logs.metrics', () => {
  it('has correct exports', () => {
    expect(TracingReplayFeedbackLogsMetricsBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.feedbackAsyncIntegration).toBe(feedbackAsyncIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.feedbackIntegration).toBe(feedbackAsyncIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.replayIntegration).toBe(replayIntegration);
    expect(TracingReplayFeedbackLogsMetricsBundle.spanStreamingIntegration).toBe(spanStreamingIntegration);

    expect(TracingReplayFeedbackLogsMetricsBundle.logger).toBe(coreLogger);
    expect(TracingReplayFeedbackLogsMetricsBundle.metrics).toBe(coreMetrics);
  });
});
