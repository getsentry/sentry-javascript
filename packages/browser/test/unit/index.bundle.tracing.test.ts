/* eslint-disable deprecation/deprecation */
import {
  FeedbackShim,
  ReplayShim,
  feedbackIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';
import { browserTracingIntegration } from '@sentry-internal/tracing';

import * as TracingBundle from '../../src/index.bundle.tracing';

describe('index.bundle.tracing', () => {
  it('has correct exports', () => {
    Object.keys(TracingBundle.Integrations).forEach(key => {
      expect((TracingBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingBundle.Integrations.Replay).toBe(ReplayShim);
    expect(TracingBundle.Replay).toBe(ReplayShim);
    expect(TracingBundle.replayIntegration).toBe(replayIntegrationShim);

    expect(TracingBundle.browserTracingIntegration).toBe(browserTracingIntegration);

    expect(TracingBundle.Feedback).toBe(FeedbackShim);
    expect(TracingBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
  });
});
