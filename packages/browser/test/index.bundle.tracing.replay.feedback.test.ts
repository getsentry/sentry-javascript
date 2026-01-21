import { consoleLoggingIntegrationShim, loggerShim } from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { browserTracingIntegration, feedbackAsyncIntegration, replayIntegration } from '../src';
import * as TracingReplayFeedbackBundle from '../src/index.bundle.tracing.replay.feedback';

describe('index.bundle.tracing.replay.feedback', () => {
  it('has correct exports', () => {
    expect(TracingReplayFeedbackBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingReplayFeedbackBundle.feedbackAsyncIntegration).toBe(feedbackAsyncIntegration);
    expect(TracingReplayFeedbackBundle.feedbackIntegration).toBe(feedbackAsyncIntegration);
    expect(TracingReplayFeedbackBundle.replayIntegration).toBe(replayIntegration);

    expect(TracingReplayFeedbackBundle.logger).toBe(loggerShim);
    expect(TracingReplayFeedbackBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
  });
});
