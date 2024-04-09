import { browserTracingIntegration } from '@sentry-internal/browser-utils';
import {
  feedbackIntegrationShim,
  feedbackModalIntegrationShim,
  feedbackScreenshotIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

import * as TracingBundle from '../../src/index.bundle.tracing';

describe('index.bundle.tracing', () => {
  it('has correct exports', () => {
    expect(TracingBundle.replayIntegration).toBe(replayIntegrationShim);
    expect(TracingBundle.browserTracingIntegration).toBe(browserTracingIntegration);
    expect(TracingBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(TracingBundle.feedbackModalIntegration).toBe(feedbackModalIntegrationShim);
    expect(TracingBundle.feedbackScreenshotIntegration).toBe(feedbackScreenshotIntegrationShim);
  });
});
