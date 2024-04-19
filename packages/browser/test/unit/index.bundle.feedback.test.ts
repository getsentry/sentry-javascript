import { replayIntegrationShim } from '@sentry-internal/integration-shims';
import { feedbackIntegration } from '@sentry/browser';

import * as FeedbackBundle from '../../src/index.bundle.feedback';

describe('index.bundle.feedback', () => {
  it('has correct exports', () => {
    expect(FeedbackBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(FeedbackBundle.feedbackIntegration).toBe(feedbackIntegration);
  });
});
