/* eslint-disable deprecation/deprecation */
import { BrowserTracingShim, ReplayShim, replayIntegrationShim } from '@sentry-internal/integration-shims';
import { Feedback, feedbackIntegration } from '@sentry/browser';

import * as TracingReplayBundle from '../../src/index.bundle.feedback';

describe('index.bundle.feedback', () => {
  it('has correct exports', () => {
    Object.keys(TracingReplayBundle.Integrations).forEach(key => {
      expect((TracingReplayBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingReplayBundle.Integrations.Replay).toBe(ReplayShim);
    expect(TracingReplayBundle.Replay).toBe(ReplayShim);
    expect(TracingReplayBundle.replayIntegration).toBe(replayIntegrationShim);

    expect(TracingReplayBundle.browserTracingIntegration()).toBeInstanceOf(BrowserTracingShim);

    expect(TracingReplayBundle.Feedback).toBe(Feedback);
    expect(TracingReplayBundle.feedbackIntegration).toBe(feedbackIntegration);
  });
});
