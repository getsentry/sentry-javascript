// This is exported so the loader does not fail when switching off Replay/Tracing
import { feedbackIntegration } from '@sentry-internal/feedback';
import {
  addTracingExtensionsShim,
  browserTracingIntegrationShim,
  replayIntegrationShim,
} from '@sentry-internal/integration-shims';

export * from './index.bundle.base';
export {
  browserTracingIntegrationShim as browserTracingIntegration,
  addTracingExtensionsShim as addTracingExtensions,
  replayIntegrationShim as replayIntegration,
  feedbackIntegration,
};
// Note: We do not export a shim for `Span` here, as that is quite complex and would blow up the bundle
