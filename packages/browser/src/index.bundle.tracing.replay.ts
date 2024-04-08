import {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry-internal/browser-utils';
import {
  feedbackIntegrationShim,
  feedbackModalIntegrationShim,
  feedbackScreenshotIntegrationShim,
} from '@sentry-internal/integration-shims';
import { replayIntegration } from '@sentry-internal/replay';
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
  feedbackModalIntegrationShim as feedbackModalIntegration,
  feedbackScreenshotIntegrationShim as feedbackScreenshotIntegration,
  browserTracingIntegration,
  addTracingExtensions,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
};

export * from './index.bundle.base';
