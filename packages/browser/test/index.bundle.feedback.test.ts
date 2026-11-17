import {
  browserTracingCoreIntegrationShim,
  browserTracingIntegrationShim,
  consoleLoggingIntegrationShim,
  fetchTracingIntegrationShim,
  linkedTracesIntegrationShim,
  loggerShim,
  longTasksIntegrationShim,
  metricsShim,
  replayIntegrationShim,
  resourcesIntegrationShim,
  spanStreamingIntegrationShim,
  xhrTracingIntegrationShim,
} from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { feedbackAsyncIntegration } from '../src';
import * as FeedbackBundle from '../src/index.bundle.feedback';

describe('index.bundle.feedback', () => {
  it('has correct exports', () => {
    expect(FeedbackBundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegrationShim);
    expect(FeedbackBundle.longTasksIntegration).toBe(longTasksIntegrationShim);
    expect(FeedbackBundle.resourcesIntegration).toBe(resourcesIntegrationShim);
    expect(FeedbackBundle.fetchTracingIntegration).toBe(fetchTracingIntegrationShim);
    expect(FeedbackBundle.xhrTracingIntegration).toBe(xhrTracingIntegrationShim);
    expect(FeedbackBundle.linkedTracesIntegration).toBe(linkedTracesIntegrationShim);

    expect(FeedbackBundle.browserTracingIntegration).toBe(browserTracingIntegrationShim);
    expect(FeedbackBundle.feedbackAsyncIntegration).toBe(feedbackAsyncIntegration);
    expect(FeedbackBundle.feedbackIntegration).toBe(feedbackAsyncIntegration);
    expect(FeedbackBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(FeedbackBundle.spanStreamingIntegration).toBe(spanStreamingIntegrationShim);

    expect(FeedbackBundle.logger).toBe(loggerShim);
    expect(FeedbackBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
    expect(FeedbackBundle.metrics).toBe(metricsShim);
  });
});
