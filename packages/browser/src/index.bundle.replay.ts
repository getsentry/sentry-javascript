// This is exported so the loader does not fail when switching off Replay/Tracing
import {
  addTracingExtensionsShim,
  browserTracingIntegrationShim,
  feedbackIntegrationShim,
} from '@sentry-internal/integration-shims';
import { replayIntegration } from '@sentry/replay';

export * from './index.bundle.base';
export {
  browserTracingIntegrationShim as browserTracingIntegration,
  addTracingExtensionsShim as addTracingExtensions,
  replayIntegration,
  feedbackIntegrationShim as feedbackIntegration,
};
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
