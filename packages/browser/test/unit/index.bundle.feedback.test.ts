import { replayIntegrationShim } from '@sentry-internal/integration-shims';
import { feedbackIntegration, feedbackModalIntegration, feedbackScreenshotIntegration } from '@sentry/browser';

import * as FeedbackBundle from '../../src/index.bundle.feedback';

describe('index.bundle.feedback', () => {
  it('has correct exports', () => {
    Object.keys(FeedbackBundle.Integrations).forEach(key => {
      expect((FeedbackBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(FeedbackBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(FeedbackBundle.feedbackIntegration).toBe(feedbackIntegration);
    expect(FeedbackBundle.feedbackModalIntegration).toBe(feedbackModalIntegration);
    expect(FeedbackBundle.feedbackScreenshotIntegration).toBe(feedbackScreenshotIntegration);
  });
});
