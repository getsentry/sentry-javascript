import { browserTracingIntegration } from '@sentry-internal/browser-utils';
import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';
import { replayIntegration } from '@sentry/browser';

import * as TracingReplayBundle from '../../src/index.bundle.tracing.replay';

describe('index.bundle.tracing.replay', () => {
  it('has correct exports', () => {
    expect(TracingReplayBundle.replayIntegration).toBe(replayIntegration);

    expect(TracingReplayBundle.browserTracingIntegration).toBe(browserTracingIntegration);

    expect(TracingReplayBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
  });
});
