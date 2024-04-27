import { feedbackIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';

import { browserTracingIntegration } from '../../src';
import * as TracingBundle from '../../src/index.bundle.tracing';

describe('index.bundle.tracing', () => {
  it('has correct exports', () => {
    expect(TracingBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(TracingBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
  });
});
