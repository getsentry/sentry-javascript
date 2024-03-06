import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';
import { browserTracingIntegration } from '@sentry-internal/tracing';
import { replayIntegration } from '@sentry/browser';

import * as TracingReplayBundle from '../../src/index.bundle.tracing.replay';

describe('index.bundle.tracing.replay', () => {
  it('has correct exports', () => {
    Object.keys(TracingReplayBundle.Integrations).forEach(key => {
      expect((TracingReplayBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingReplayBundle.replayIntegration).toBe(replayIntegration);

    expect(TracingReplayBundle.browserTracingIntegration).toBe(browserTracingIntegration);

    expect(TracingReplayBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
  });
});
