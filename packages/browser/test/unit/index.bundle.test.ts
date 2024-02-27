/* eslint-disable deprecation/deprecation */
import {
  FeedbackShim,
  ReplayShim,
  feedbackIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

import * as TracingBundle from '../../src/index.bundle';

describe('index.bundle', () => {
  it('has correct exports', () => {
    Object.keys(TracingBundle.Integrations).forEach(key => {
      expect((TracingBundle.Integrations[key] as any).name).toStrictEqual(expect.any(String));
    });

    expect(TracingBundle.Integrations.Replay).toBe(ReplayShim);
    expect(TracingBundle.Replay).toBe(ReplayShim);
    expect(TracingBundle.replayIntegration).toBe(replayIntegrationShim);

    expect(TracingBundle.Feedback).toBe(FeedbackShim);
    expect(TracingBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
  });
});
