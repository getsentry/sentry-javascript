import { describe, expect, it } from 'vitest';

import {
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

import * as Bundle from '../src/index.bundle';

describe('index.bundle', () => {
  it('has correct exports', () => {
    expect(Bundle.browserTracingIntegration).toBe(browserTracingIntegrationShim);
    expect(Bundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(Bundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(Bundle.replayIntegration).toBe(replayIntegrationShim);
  });
});
