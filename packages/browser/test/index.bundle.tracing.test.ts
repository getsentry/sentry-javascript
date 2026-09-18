import {
  consoleLoggingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  metricsShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { browserTracingIntegration, spanStreamingIntegration, webVitalsIntegration } from '../src';
import * as TracingBundle from '../src/index.bundle.tracing';

describe('index.bundle.tracing', () => {
  it('has correct exports', () => {
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
