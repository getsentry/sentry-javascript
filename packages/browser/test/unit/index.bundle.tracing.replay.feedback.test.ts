import { browserTracingIntegration } from '@sentry-internal/tracing';
import { feedbackIntegration, replayIntegration } from '@sentry/browser';

import * as TracingReplayFeedbackBundle from '../../src/index.bundle.tracing.replay.feedback';

describe('index.bundle.tracing.replay.feedback', () => {
  it('has correct exports', () => {
    Object.keys(TracingReplayFeedbackBundle.Integrations).forEach(key => {
      expect((TracingReplayFeedbackBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingReplayFeedbackBundle.replayIntegration).toBe(replayIntegration);
    expect(TracingReplayFeedbackBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingReplayFeedbackBundle.feedbackIntegration).toBe(feedbackIntegration);
  });
});
