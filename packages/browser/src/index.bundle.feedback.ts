// This is exported so the loader does not fail when switching off Replay/Tracing
import {
  addTracingExtensionsShim,
  browserTracingIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';

export {
  feedbackIntegration,
  feedbackModalIntegration,
  feedbackScreenshotIntegration,
  getFeedback,
} from '@sentry-internal/feedback';

export {
  browserTracingIntegrationShim as browserTracingIntegration,
  addTracingExtensionsShim as addTracingExtensions,
  replayIntegrationShim as replayIntegration,
};
