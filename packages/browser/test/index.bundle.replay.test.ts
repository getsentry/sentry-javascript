import {
  browserTracingCoreIntegrationShim,
  browserTracingIntegrationShim,
  consoleLoggingIntegrationShim,
  feedbackIntegrationShim,
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
import { replayIntegration } from '../src';
import * as ReplayBundle from '../src/index.bundle.replay';

describe('index.bundle.replay', () => {
  it('has correct exports', () => {
    expect(ReplayBundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegrationShim);
    expect(ReplayBundle.longTasksIntegration).toBe(longTasksIntegrationShim);
    expect(ReplayBundle.resourcesIntegration).toBe(resourcesIntegrationShim);
    expect(ReplayBundle.fetchTracingIntegration).toBe(fetchTracingIntegrationShim);
    expect(ReplayBundle.xhrTracingIntegration).toBe(xhrTracingIntegrationShim);
    expect(ReplayBundle.linkedTracesIntegration).toBe(linkedTracesIntegrationShim);

    expect(ReplayBundle.browserTracingIntegration).toBe(browserTracingIntegrationShim);
    expect(ReplayBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(ReplayBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(ReplayBundle.replayIntegration).toBe(replayIntegration);
    expect(ReplayBundle.spanStreamingIntegration).toBe(spanStreamingIntegrationShim);

    expect(ReplayBundle.logger).toBe(loggerShim);
    expect(ReplayBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
    expect(ReplayBundle.metrics).toBe(metricsShim);
  });
});
