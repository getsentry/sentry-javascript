import { consoleLoggingIntegrationShim, loggerShim, metricsShim } from '@sentry-internal/integration-shims';
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
import * as TracingReplayFeedbackBundle from '../src/index.bundle.tracing.replay.feedback';

describe('index.bundle.tracing.replay.feedback', () => {
  it('has correct exports', () => {
    expect(TracingReplayFeedbackBundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegration);
    expect(TracingReplayFeedbackBundle.longTasksIntegration).toBe(longTasksIntegration);
    expect(TracingReplayFeedbackBundle.resourcesIntegration).toBe(resourcesIntegration);
    expect(TracingReplayFeedbackBundle.fetchTracingIntegration).toBe(fetchTracingIntegration);
    expect(TracingReplayFeedbackBundle.xhrTracingIntegration).toBe(xhrTracingIntegration);
    expect(TracingReplayFeedbackBundle.linkedTracesIntegration).toBe(linkedTracesIntegration);

    expect(TracingReplayFeedbackBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingReplayFeedbackBundle.feedbackAsyncIntegration).toBe(feedbackAsyncIntegration);
    expect(TracingReplayFeedbackBundle.feedbackIntegration).toBe(feedbackAsyncIntegration);
    expect(TracingReplayFeedbackBundle.replayIntegration).toBe(replayIntegration);
    expect(TracingReplayFeedbackBundle.spanStreamingIntegration).toBe(spanStreamingIntegration);
    expect(TracingReplayFeedbackBundle.webVitalsIntegration).toBe(webVitalsIntegration);

    expect(TracingReplayFeedbackBundle.logger).toBe(loggerShim);
    expect(TracingReplayFeedbackBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
    expect(TracingReplayFeedbackBundle.metrics).toBe(metricsShim);
  });
});
