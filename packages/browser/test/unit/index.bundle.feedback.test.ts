import { replayIntegrationShim } from '@sentry-internal/integration-shims';
import { feedbackIntegration } from '@sentry/browser';

import * as TracingReplayBundle from '../../src/index.bundle.feedback';

describe('index.bundle.feedback', () => {
  it('has correct exports', () => {
    expect(TracingReplayBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(TracingReplayBundle.feedbackIntegration).toBe(feedbackIntegration);
  });
});
