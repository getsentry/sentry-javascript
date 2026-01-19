import { consoleLoggingIntegrationShim, feedbackIntegrationShim, loggerShim } from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { browserTracingIntegration, replayIntegration } from '../src';
import * as TracingReplayBundle from '../src/index.bundle.tracing.replay';

describe('index.bundle.tracing.replay', () => {
  it('has correct exports', () => {
    expect(TracingReplayBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingReplayBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(TracingReplayBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(TracingReplayBundle.replayIntegration).toBe(replayIntegration);

    expect(TracingReplayBundle.logger).toBe(loggerShim);
    expect(TracingReplayBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
  });
});
