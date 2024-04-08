import {
  browserTracingIntegration,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
} from '@sentry-internal/browser-utils';
import { feedbackIntegration, getFeedback } from '@sentry-internal/feedback';
import { feedbackModalIntegration } from '@sentry-internal/feedback-modal';
import { feedbackScreenshotIntegration } from '@sentry-internal/feedback-screenshot';
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
  feedbackIntegration,
  feedbackModalIntegration,
  feedbackScreenshotIntegration,
  replayIntegration,
  browserTracingIntegration,
  addTracingExtensions,
  startBrowserTracingNavigationSpan,
  startBrowserTracingPageLoadSpan,
  getFeedback,
};

export * from './index.bundle.base';
