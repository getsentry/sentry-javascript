import {
  consoleLoggingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  metricsShim,
} from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import {
  browserTracingCoreIntegration,
  browserTracingIntegration,
  fetchTracingIntegration,
  linkedTracesIntegration,
  longTasksIntegration,
  replayIntegration,
  resourcesIntegration,
  spanStreamingIntegration,
  webVitalsIntegration,
  xhrTracingIntegration,
} from '../src';
import * as TracingReplayBundle from '../src/index.bundle.tracing.replay';

describe('index.bundle.tracing.replay', () => {
  it('has correct exports', () => {
    expect(TracingReplayBundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegration);
    expect(TracingReplayBundle.longTasksIntegration).toBe(longTasksIntegration);
    expect(TracingReplayBundle.resourcesIntegration).toBe(resourcesIntegration);
    expect(TracingReplayBundle.fetchTracingIntegration).toBe(fetchTracingIntegration);
    expect(TracingReplayBundle.xhrTracingIntegration).toBe(xhrTracingIntegration);
    expect(TracingReplayBundle.linkedTracesIntegration).toBe(linkedTracesIntegration);

    expect(TracingReplayBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingReplayBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(TracingReplayBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(TracingReplayBundle.replayIntegration).toBe(replayIntegration);
    expect(TracingReplayBundle.spanStreamingIntegration).toBe(spanStreamingIntegration);
    expect(TracingReplayBundle.webVitalsIntegration).toBe(webVitalsIntegration);

    expect(TracingReplayBundle.logger).toBe(loggerShim);
    expect(TracingReplayBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
    expect(TracingReplayBundle.metrics).toBe(metricsShim);
  });
});
