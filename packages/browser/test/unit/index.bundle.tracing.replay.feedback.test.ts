import { BrowserTracing } from '@sentry-internal/tracing';
import { Feedback, Replay } from '@sentry/browser';

import * as TracingReplayFeedbackBundle from '../../src/index.bundle.tracing.replay.feedback';

describe('index.bundle.tracing.replay.feedback', () => {
  it('has correct exports', () => {
    Object.keys(TracingReplayFeedbackBundle.Integrations).forEach(key => {
      // Skip BrowserTracing because it doesn't have a static id field.
      if (key === 'BrowserTracing') {
        return;
      }

      expect((TracingReplayFeedbackBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingReplayFeedbackBundle.Integrations.Replay).toBe(Replay);
    expect(TracingReplayFeedbackBundle.Replay).toBe(Replay);

    expect(TracingReplayFeedbackBundle.Integrations.BrowserTracing).toBe(BrowserTracing);
    expect(TracingReplayFeedbackBundle.BrowserTracing).toBe(BrowserTracing);

    expect(TracingReplayFeedbackBundle.Feedback).toBe(Feedback);
  });
});
