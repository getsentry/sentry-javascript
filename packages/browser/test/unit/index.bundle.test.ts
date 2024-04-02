import { feedbackIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';

import * as TracingBundle from '../../src/index.bundle';

describe('index.bundle', () => {
  it('has correct exports', () => {
    expect(TracingBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(TracingBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
  });
});
