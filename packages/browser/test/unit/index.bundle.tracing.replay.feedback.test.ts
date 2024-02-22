/* eslint-disable deprecation/deprecation */
import { browserTracingIntegration } from '@sentry-internal/tracing';
import { Feedback, Replay, feedbackIntegration, replayIntegration } from '@sentry/browser';

import * as TracingReplayFeedbackBundle from '../../src/index.bundle.tracing.replay.feedback';

describe('index.bundle.tracing.replay.feedback', () => {
  it('has correct exports', () => {
    Object.keys(TracingReplayFeedbackBundle.Integrations).forEach(key => {
      expect((TracingReplayFeedbackBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingReplayFeedbackBundle.Integrations.Replay).toBe(Replay);
    expect(TracingReplayFeedbackBundle.Replay).toBe(Replay);
    expect(TracingReplayFeedbackBundle.replayIntegration).toBe(replayIntegration);

    expect(TracingReplayFeedbackBundle.browserTracingIntegration).toBe(browserTracingIntegration);

    expect(TracingReplayFeedbackBundle.Feedback).toBe(Feedback);
    expect(TracingReplayFeedbackBundle.feedbackIntegration).toBe(feedbackIntegration);
  });
});
