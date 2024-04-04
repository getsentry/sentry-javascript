import { feedbackIntegrationShim } from '@sentry-internal/integration-shims';
import { replayIntegration } from '@sentry-internal/replay';
import {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry-internal/tracing';
import { addTracingExtensions } from '@sentry/core';

// We are patching the global object with our hub extension methods
addTracingExtensions();

export {
  getActiveSpan,
  getRootSpan,
  startSpan,
  startInactiveSpan,
  startSpanManual,
  withActiveSpan,
  getSpanDescendants,
  setMeasurement,
} from '@sentry/core';

export {
  replayIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  browserTracingIntegration,
  addTracingExtensions,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
};

export * from './index.bundle.base';
