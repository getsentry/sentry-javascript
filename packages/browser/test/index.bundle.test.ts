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
  replayIntegrationShim,
  resourcesIntegrationShim,
  spanStreamingIntegrationShim,
  xhrTracingIntegrationShim,
} from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import * as Bundle from '../src/index.bundle';

describe('index.bundle', () => {
  it('has correct exports', () => {
    expect(Bundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegrationShim);
    expect(Bundle.longTasksIntegration).toBe(longTasksIntegrationShim);
    expect(Bundle.resourcesIntegration).toBe(resourcesIntegrationShim);
    expect(Bundle.fetchTracingIntegration).toBe(fetchTracingIntegrationShim);
    expect(Bundle.xhrTracingIntegration).toBe(xhrTracingIntegrationShim);
    expect(Bundle.linkedTracesIntegration).toBe(linkedTracesIntegrationShim);

    expect(Bundle.browserTracingIntegration).toBe(browserTracingIntegrationShim);
    expect(Bundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(Bundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(Bundle.replayIntegration).toBe(replayIntegrationShim);
    expect(Bundle.spanStreamingIntegration).toBe(spanStreamingIntegrationShim);

    expect(Bundle.logger).toBe(loggerShim);
    expect(Bundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
    expect(Bundle.metrics).toBe(metricsShim);
  });
});
