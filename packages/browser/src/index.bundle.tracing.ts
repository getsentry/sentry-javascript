import {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry-internal/browser-utils';
// This is exported so the loader does not fail when switching off Replay
import {
  feedbackIntegrationShim,
  feedbackModalIntegrationShim,
  feedbackScreenshotIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';
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
  feedbackIntegrationShim as feedbackIntegration,
  feedbackModalIntegrationShim as feedbackModalIntegration,
  feedbackScreenshotIntegrationShim as feedbackScreenshotIntegration,
  replayIntegrationShim as replayIntegration,
  browserTracingIntegration,
  addTracingExtensions,
  startBrowserTracingPageLoadSpan,
  startBrowserTracingNavigationSpan,
};

export * from './index.bundle.base';
