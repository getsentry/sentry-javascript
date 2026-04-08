import {
  consoleLoggingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { browserTracingIntegration } from '../src';
import * as TracingBundle from '../src/index.bundle.tracing';

describe('index.bundle.tracing', () => {
  it('has correct exports', () => {
    expect(TracingBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(TracingBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(TracingBundle.replayIntegration).toBe(replayIntegrationShim);

    expect(TracingBundle.logger).toBe(loggerShim);
    expect(TracingBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
  });
});
