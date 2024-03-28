import {
  feedbackIntegrationShim,
  feedbackModalIntegrationShim,
  feedbackScreenshotIntegrationShim,
} from '@sentry-internal/integration-shims';
import { replayIntegration } from '@sentry/browser';

import * as ReplayBundle from '../../src/index.bundle.replay';

describe('index.bundle.replay', () => {
  it('has correct exports', () => {
    Object.keys(ReplayBundle.Integrations).forEach(key => {
      expect((ReplayBundle.Integrations[key] as any).id).toStrictEqual(expect.any(String));
    });

    expect(ReplayBundle.replayIntegration).toBe(replayIntegration);
    expect(ReplayBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(ReplayBundle.feedbackModalIntegration).toBe(feedbackModalIntegrationShim);
    expect(ReplayBundle.feedbackScreenshotIntegration).toBe(feedbackScreenshotIntegrationShim);
  });
});
