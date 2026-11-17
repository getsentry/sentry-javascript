import { logger as coreLogger, metrics as coreMetrics } from '@sentry/core';
import {
  browserTracingCoreIntegrationShim,
  fetchTracingIntegrationShim,
  linkedTracesIntegrationShim,
  longTasksIntegrationShim,
  resourcesIntegrationShim,
  spanStreamingIntegrationShim,
  xhrTracingIntegrationShim,
} from '@sentry-internal/integration-shims';
import { describe, expect, it } from 'vitest';
import * as LogsMetricsBundle from '../src/index.bundle.logs.metrics';

describe('index.bundle.logs.metrics', () => {
  it('has correct exports', () => {
    expect(LogsMetricsBundle.browserTracingCoreIntegration).toBe(browserTracingCoreIntegrationShim);
    expect(LogsMetricsBundle.longTasksIntegration).toBe(longTasksIntegrationShim);
    expect(LogsMetricsBundle.resourcesIntegration).toBe(resourcesIntegrationShim);
    expect(LogsMetricsBundle.fetchTracingIntegration).toBe(fetchTracingIntegrationShim);
    expect(LogsMetricsBundle.xhrTracingIntegration).toBe(xhrTracingIntegrationShim);
    expect(LogsMetricsBundle.linkedTracesIntegration).toBe(linkedTracesIntegrationShim);

    expect(LogsMetricsBundle.logger).toBe(coreLogger);
    expect(LogsMetricsBundle.metrics).toBe(coreMetrics);
    expect(LogsMetricsBundle.spanStreamingIntegration).toBe(spanStreamingIntegrationShim);
  });
});
