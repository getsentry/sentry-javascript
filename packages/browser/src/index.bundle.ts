// This is exported so the loader does not fail when switching off Replay/Tracing
import {
  addTracingExtensionsShim,
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';
export {
  addTracingExtensionsShim as addTracingExtensions,
  browserTracingIntegrationShim as browserTracingIntegration,
  feedbackIntegrationShim as feedbackIntegration,
  replayIntegrationShim as replayIntegration,
};
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
