import {
  feedbackIntegrationShim,
  feedbackModalIntegrationShim,
  feedbackScreenshotIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

import * as Bundle from '../../src/index.bundle';

describe('index.bundle', () => {
  it('has correct exports', () => {
    Object.keys(Bundle.Integrations).forEach(key => {
      expect((Bundle.Integrations[key] as any).name).toStrictEqual(expect.any(String));
    });

    expect(Bundle.replayIntegration).toBe(replayIntegrationShim);
    expect(Bundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(Bundle.feedbackModalIntegration).toBe(feedbackModalIntegrationShim);
    expect(Bundle.feedbackScreenshotIntegration).toBe(feedbackScreenshotIntegrationShim);
  });
});
