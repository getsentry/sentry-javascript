import {
  browserTracingCoreIntegrationShim,
  browserTracingIntegrationShim,
  consoleLoggingIntegrationShim,
  fetchTracingIntegrationShim,
  linkedTracesIntegrationShim,
  loggerShim,
  longTasksIntegrationShim,
  metricsShim,
  resourcesIntegrationShim,
  spanStreamingIntegrationShim,
  xhrTracingIntegrationShim,
} from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { feedbackAsyncIntegration, replayIntegration } from '../src';
import * as ReplayFeedbackBundle from '../src/index.bundle.replay.feedback';

describe('index.bundle.replay.feedback', () => {
  it('has correct exports', () => {
    expect(ReplayFeedbackBundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegrationShim);
    expect(ReplayFeedbackBundle.longTasksIntegration).toBe(longTasksIntegrationShim);
    expect(ReplayFeedbackBundle.resourcesIntegration).toBe(resourcesIntegrationShim);
    expect(ReplayFeedbackBundle.fetchTracingIntegration).toBe(fetchTracingIntegrationShim);
    expect(ReplayFeedbackBundle.xhrTracingIntegration).toBe(xhrTracingIntegrationShim);
    expect(ReplayFeedbackBundle.linkedTracesIntegration).toBe(linkedTracesIntegrationShim);

    expect(ReplayFeedbackBundle.browserTracingIntegration).toBe(browserTracingIntegrationShim);
    expect(ReplayFeedbackBundle.feedbackAsyncIntegration).toBe(feedbackAsyncIntegration);
    expect(ReplayFeedbackBundle.feedbackIntegration).toBe(feedbackAsyncIntegration);
    expect(ReplayFeedbackBundle.replayIntegration).toBe(replayIntegration);
    expect(ReplayFeedbackBundle.spanStreamingIntegration).toBe(spanStreamingIntegrationShim);

    expect(ReplayFeedbackBundle.logger).toBe(loggerShim);
    expect(ReplayFeedbackBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
    expect(ReplayFeedbackBundle.metrics).toBe(metricsShim);
  });
});
