import {
  consoleLoggingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  metricsShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';
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
import * as TracingBundle from '../src/index.bundle.tracing';

describe('index.bundle.tracing', () => {
  it('has correct exports', () => {
    expect(TracingBundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegration);
    expect(TracingBundle.longTasksIntegration).toBe(longTasksIntegration);
    expect(TracingBundle.resourcesIntegration).toBe(resourcesIntegration);
    expect(TracingBundle.fetchTracingIntegration).toBe(fetchTracingIntegration);
    expect(TracingBundle.xhrTracingIntegration).toBe(xhrTracingIntegration);
    expect(TracingBundle.linkedTracesIntegration).toBe(linkedTracesIntegration);

    expect(TracingBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(TracingBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(TracingBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(TracingBundle.spanStreamingIntegration).toBe(spanStreamingIntegration);
    expect(TracingBundle.webVitalsIntegration).toBe(webVitalsIntegration);

    expect(TracingBundle.logger).toBe(loggerShim);
    expect(TracingBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
    expect(TracingBundle.metrics).toBe(metricsShim);
  });
});
