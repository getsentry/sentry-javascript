import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';
import { replayIntegration } from '@sentry/browser';

import * as TracingReplayBundle from '../../src/index.bundle.replay';

describe('index.bundle.replay', () => {
  it('has correct exports', () => {
    expect(TracingReplayBundle.replayIntegration).toBe(replayIntegration);
    expect(TracingReplayBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
  });
});
