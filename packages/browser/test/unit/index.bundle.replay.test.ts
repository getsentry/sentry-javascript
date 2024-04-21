import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';
import { replayIntegration } from '@sentry/browser';

import * as ReplayBundle from '../../src/index.bundle.replay';

describe('index.bundle.replay', () => {
  it('has correct exports', () => {
    expect(ReplayBundle.replayIntegration).toBe(replayIntegration);
    expect(ReplayBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
  });
});
