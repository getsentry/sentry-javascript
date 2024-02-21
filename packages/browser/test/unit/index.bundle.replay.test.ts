/* eslint-disable deprecation/deprecation */
import {
  BrowserTracing as BrowserTracingShim,
  Feedback as FeedbackShim,
  feedbackIntegration as feedbackIntegrationShim,
} from '@sentry-internal/integration-shims';
import { Replay, replayIntegration } from '@sentry/browser';

import * as TracingReplayBundle from '../../src/index.bundle.replay';

describe('index.bundle.replay', () => {
  it('has correct exports', () => {
    Object.keys(TracingReplayBundle.Integrations).forEach(key => {
      // Skip BrowserTracing because it doesn't have a static id field.
      if (key === 'BrowserTracing') {
        return;
      }

      expect((TracingReplayBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingReplayBundle.Integrations.Replay).toBe(Replay);
    expect(TracingReplayBundle.Replay).toBe(Replay);
    expect(TracingReplayBundle.replayIntegration).toBe(replayIntegration);

    expect(TracingReplayBundle.Integrations.BrowserTracing).toBe(BrowserTracingShim);
    expect(TracingReplayBundle.BrowserTracing).toBe(BrowserTracingShim);

    expect(TracingReplayBundle.Feedback).toBe(FeedbackShim);
    expect(TracingReplayBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
  });
});
