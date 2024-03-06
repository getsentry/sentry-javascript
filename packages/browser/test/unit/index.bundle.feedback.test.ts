import { replayIntegrationShim } from '@sentry-internal/integration-shims';
import { feedbackIntegration } from '@sentry/browser';

import * as TracingReplayBundle from '../../src/index.bundle.feedback';

describe('index.bundle.feedback', () => {
  it('has correct exports', () => {
    Object.keys(TracingReplayBundle.Integrations).forEach(key => {
      expect((TracingReplayBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(TracingReplayBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(TracingReplayBundle.feedbackIntegration).toBe(feedbackIntegration);
  });
});
