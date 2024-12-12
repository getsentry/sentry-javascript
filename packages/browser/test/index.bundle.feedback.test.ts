import { describe, expect, it } from 'vitest';

import { browserTracingIntegrationShim, replayIntegrationShim } from '@sentry-internal/integration-shims';
import { feedbackAsyncIntegration } from '../src';

import * as FeedbackBundle from '../src/index.bundle.feedback';

describe('index.bundle.feedback', () => {
  it('has correct exports', () => {
    expect(FeedbackBundle.browserTracingIntegration).toBe(browserTracingIntegrationShim);
    expect(FeedbackBundle.feedbackAsyncIntegration).toBe(feedbackAsyncIntegration);
    expect(FeedbackBundle.feedbackIntegration).toBe(feedbackAsyncIntegration);
    expect(FeedbackBundle.replayIntegration).toBe(replayIntegrationShim);
  });
});
