import {
  browserTracingIntegrationShim,
  consoleLoggingIntegrationShim,
  loggerShim,
} from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { feedbackAsyncIntegration, replayIntegration } from '../src';
import * as ReplayFeedbackBundle from '../src/index.bundle.replay.feedback';

describe('index.bundle.replay.feedback', () => {
  it('has correct exports', () => {
    expect(ReplayFeedbackBundle.browserTracingIntegration).toBe(browserTracingIntegrationShim);
    expect(ReplayFeedbackBundle.feedbackAsyncIntegration).toBe(feedbackAsyncIntegration);
    expect(ReplayFeedbackBundle.feedbackIntegration).toBe(feedbackAsyncIntegration);
    expect(ReplayFeedbackBundle.replayIntegration).toBe(replayIntegration);

    expect(ReplayFeedbackBundle.logger).toBe(loggerShim);
    expect(ReplayFeedbackBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
  });
});
