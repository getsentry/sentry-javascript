import {
  browserTracingIntegrationShim,
  consoleLoggingIntegrationShim,
  feedbackIntegrationShim,
  loggerShim,
} from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import { replayIntegration } from '../src';
import * as ReplayBundle from '../src/index.bundle.replay';

describe('index.bundle.replay', () => {
  it('has correct exports', () => {
    expect(ReplayBundle.browserTracingIntegration).toBe(browserTracingIntegrationShim);
    expect(ReplayBundle.feedbackAsyncIntegration).toBe(feedbackIntegrationShim);
    expect(ReplayBundle.feedbackIntegration).toBe(feedbackIntegrationShim);
    expect(ReplayBundle.replayIntegration).toBe(replayIntegration);

    expect(ReplayBundle.logger).toBe(loggerShim);
    expect(ReplayBundle.consoleLoggingIntegration).toBe(consoleLoggingIntegrationShim);
  });
});
