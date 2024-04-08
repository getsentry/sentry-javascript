import { browserTracingIntegration } from '@sentry-internal/browser-utils';
import { feedbackIntegration, replayIntegration } from '@sentry/browser';

import * as TracingReplayFeedbackBundle from '../../src/index.bundle.tracing.replay.feedback';

describe('index.bundle.tracing.replay.feedback', () => {
  it('has correct exports', () => {
    expect(TracingReplayFeedbackBundle.replayIntegration).toBe(replayIntegration);
    expect(TracingReplayFeedbackBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingReplayFeedbackBundle.feedbackIntegration).toBe(feedbackIntegration);
  });
});
